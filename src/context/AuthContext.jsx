import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { sendWelcomeEmail } from '../lib/email'
import { isNativeApp, authRedirect, emailRedirect } from '../lib/platform'
import { isInstitutionalEmail, isGmailEmail, canUserAccessMutu } from '../config/auth'
import { checkAccessCode, redeemAccessCode, accessCodeReasonLabel } from '../lib/accessCodes'
import { checkLinkedVerifiedEmail, checkPremiumAccess } from '../lib/access'
import { isAdmin } from '../data/adminEmails'

// Run an OAuth provider flow inside the native shell. On the web Supabase
// redirects the whole page and handles the return itself; in the app there is
// no page to redirect, so we ask for the provider URL without redirecting,
// open it in the system browser (SFSafariViewController — shares no cookies
// with the webview, which is what Google requires), and wait for iOS to hand
// the com.muturing.mutu://auth/callback URL back through the App plugin.
// startFlow is whichever Supabase call applies: signInWithOAuth or
// linkIdentity, already given skipBrowserRedirect and the custom redirectTo.
async function runNativeOAuth(startFlow) {
  const { data, error } = await startFlow()
  if (error) return { error }
  if (!data?.url) return { error: new Error('No provider URL returned.') }

  // Resolve when the deep link comes back, so callers can await the whole
  // round-trip and surface a single error.
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      urlSub.then(s => s.remove()).catch(() => {})
      closeSub.then(s => s.remove()).catch(() => {})
      Browser.close().catch(() => {})
      resolve(result)
    }

    const urlSub = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith('com.muturing.mutu://')) return
      // PKCE: the callback carries ?code=…; trade it for a session. An
      // ?error=… instead means the user cancelled or Google refused.
      try {
        const parsed = new URL(url)
        const code = parsed.searchParams.get('code')
        const oauthErr = parsed.searchParams.get('error_description')
          || parsed.searchParams.get('error')
        if (oauthErr) return finish({ error: new Error(oauthErr) })
        if (!code)    return finish({ error: new Error('Callback missing code.') })
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        finish({ error: exErr || null })
      } catch (e) {
        finish({ error: e instanceof Error ? e : new Error('Callback parse failed.') })
      }
    })

    // The user can dismiss the browser without ever reaching the callback —
    // tapping Cancel on Google's consent screen, or swiping the sheet away.
    // That fires no appUrlOpen, so without this the promise would hang and the
    // button would sit on "Please wait…" forever. browserFinished also fires
    // when finish() calls Browser.close() after success, but settled is true
    // by then, so this only wins on a genuine cancel. Resolve with no error:
    // a deliberate cancel is not something to show a red message about.
    const closeSub = Browser.addListener('browserFinished', () => {
      finish({ error: null, cancelled: true })
    })

    Browser.open({ url: data.url }).catch((e) =>
      finish({ error: e instanceof Error ? e : new Error('Could not open browser.') })
    )
  })
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  // Password-recovery mode is flipped on when Supabase fires the
  // PASSWORD_RECOVERY auth event (user clicked the reset link in their
  // email). LoginScreen surfaces a "Set new password" panel while this
  // is true. Cleared automatically after updateUser succeeds.
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  // Set when the post-signin invite gate rejects a user. LoginScreen
  // reads this and shows the reason once we've bounced them back out.
  // Cleared when the user starts a new sign-in attempt.
  const [accessDenied, setAccessDenied] = useState(null)
  // Guard against double-subscribe in StrictMode / HMR
  const initialized = useRef(false)

  // ── Bootstrap ────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    if (initialized.current) return
    initialized.current = true

    let mounted = true

    supabase.auth.getSession()
      .then(({ data: { session: s }, error }) => {
        if (!mounted) return
        if (error) console.warn('[ReciRing] getSession error (non-fatal):', error.message)
        console.log('[ReciRing] bootstrap session:', !!s, s?.user?.email)
        setSession(s)
        if (s) gateAndEnsureProfile(s.user)
        else setLoading(false)
      })
      .catch((err) => {
        console.warn('[ReciRing] getSession threw (non-fatal):', err?.message)
        if (mounted) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        console.log('[ReciRing] auth event:', event, 'session:', !!s, 'user:', s?.user?.email)
        if (!mounted) return
        // Ignore token refresh noise for session state — session reference
        // stays stable, no need to re-trigger profile loads.
        if (event === 'TOKEN_REFRESHED') {
          setSession(s)
          return
        }
        // Supabase fires PASSWORD_RECOVERY when the app is loaded via a
        // reset-password link. The session is a partial recovery session
        // — we treat the app as gated by LoginScreen's set-password
        // panel until updateUser succeeds.
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true)
          setSession(s)
          setLoading(false)
          return
        }
        setSession(s)
        if (s) gateAndEnsureProfile(s.user)
        else { setProfile(null); setLoading(false) }
      },
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  // ── Access gate ─────────────────────────────────────────────
  //
  // Runs BEFORE ensureProfile on every authenticated session (bootstrap
  // + auth event). Enforces the "UofT direct, Gmail invite-only" rule
  // AFTER Supabase auth succeeds — this is the actual boundary a
  // Google OAuth callback has to cross.
  //
  // Order of checks:
  //   1. Admin email → allow (admins bypass the invite gate; otherwise
  //      the operator gets locked out of their own product).
  //   2. Institutional email → allow. Existing UofT profiles are
  //      grandfathered here since ensureProfile picks up the existing
  //      row. New signups get access_type='institutional_email'.
  //   3. Gmail → check invite (pre-issued for this email OR a code
  //      stashed in sessionStorage by LoginScreen before OAuth). NO
  //      profile-based grandfathering — a pre-existing Gmail profile
  //      row alone doesn't authorize; the invite has to be valid.
  //   4. Anything else → deny.
  //
  // Reject path (denyAccess) clears UI state SYNCHRONOUSLY so AppRoot
  // renders LoginScreen this tick, THEN calls signOut in the
  // background to purge Supabase's localStorage session.
  //
  // Client-side check is defence in depth against a stale JWT; the
  // profiles.access_type CHECK constraint in the migration is the
  // DB-level guarantee that only allowed values ever land on a row.
  async function gateAndEnsureProfile(user) {
    if (!user) { setLoading(false); return }
    // Hold on the spinner while the async gate runs. Without this,
    // AppRoot sees session=truthy + profile=null and briefly renders
    // AppShell before the gate finishes.
    setLoading(true)
    setProfile(null)

    const email = String(user.email || '').toLowerCase().trim()

    // 1. Admins bypass the invite gate.
    if (isAdmin(email)) {
      return ensureProfile(user, {
        accessType: isInstitutionalEmail(email) ? 'institutional_email' : 'invited_google',
      })
    }

    // 2. Institutional → allowed. If a row already exists (grandfathered
    //    UofT member), ensureProfile picks it up unchanged. New signup
    //    → access_type is set on insert.
    if (isInstitutionalEmail(email)) {
      return ensureProfile(user, { accessType: 'institutional_email' })
    }

    // 3. Full access chain: linked verified email → invite/referral
    //    code (from sessionStorage) → premium status.
    const decision = await canUserAccessMutu(email, {
      userId: user.id,
      checkLinkedVerifiedEmail,
      checkAccessCode,
      redeemAccessCode,
      checkPremiumAccess,
      stashedCode: safeReadSession('mutu_access_code'),
    })

    if (decision.ok) {
      safeClearSession('mutu_access_code')
      return ensureProfile(user, {
        accessType:       decision.accessType,
        referredByUserId: decision.referredByUserId,
        joinedWithCode:   decision.joinedWithCode,
      })
    }

    // Log the raw reason so operators can inspect DevTools if the
    // user-facing message isn't specific enough. Non-fatal.
    console.warn('[Mutu] access denied:', decision.reason, 'email:', email)

    // Copy per product spec — no "ask an admin to invite you."
    if (decision.reason === 'gmail_requires_invite_or_referral') {
      return denyAccess(
        'Gmail login requires an invite code or a referral from an existing Mutu member.',
      )
    }
    // A specific code-reject reason. Use accessCodeReasonLabel so
    // "expired" / "already used" / "revoked" / "not found" get
    // distinct messages — critical for debugging seed / migration
    // issues in production.
    if (typeof decision.reason === 'string' && decision.reason.startsWith('code_')) {
      return denyAccess(accessCodeReasonLabel(decision.reason))
    }
    return denyAccess(
      "This email isn't eligible for Mutu yet. Sign up with your UofT email, or use an invite or referral code.",
    )
  }

  // Reject an authenticated user who didn't pass the gate. The tricky
  // part is that supabase.auth.signOut() is async — awaiting it before
  // clearing session state leaves a window where AppRoot sees a
  // truthy session with no profile and renders AppShell. Fix: clear
  // React state FIRST (synchronous), then purge Supabase's persistent
  // localStorage session in the background.
  function denyAccess(message) {
    // Order matters — every setter here runs before React re-renders
    // AppRoot, so the very next render already shows LoginScreen with
    // the error rather than a flash of AppShell.
    setAccessDenied(message)
    setProfile(null)
    setSession(null)
    setLoading(false)
    safeClearSession('mutu:pendingInviteCode')

    // Background: purge Supabase's localStorage session so a hard
    // refresh doesn't restore the rejected identity. Fire-and-forget
    // — the UI is already on LoginScreen.
    supabase.auth.signOut().catch(err => {
      console.warn('[ReciRing] denyAccess signOut error (ignored):', err?.message)
    })

    // Reflect the reject in the URL so the LoginScreen error banner
    // survives a reload. Also, when Supabase's OAuth callback lands
    // at "/#access_token=…", replacing the URL cleans up the hash.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('error', 'invite_required')
      url.hash = ''
      window.history.replaceState({}, '', url.toString())
    } catch {}
  }

  // ── Mirror a linked Google identity into user_emails ───────────
  //
  // linkIdentity() records the provider in Supabase's auth.identities, but
  // everything in the app that asks "has this user linked an account?" reads
  // user_emails instead. Nothing bridged the two: the only insert lives in
  // the new-profile branch below, which existing users never reach because
  // ensureProfile returns early once a profile row is found. The result was
  // a loop — linking succeeded, the prompt kept re-appearing, and linking
  // again changed nothing.
  //
  // Runs on every sign-in rather than only on the /?linked=google return, so
  // accounts already stuck in that loop heal themselves on their next login
  // without having to link a second time.
  async function mirrorGoogleIdentity(user) {
    if (!user?.id) return

    // The user that comes off getSession()/onAuthStateChange is decoded from
    // the JWT, and identities are not in the token — the field is optional on
    // the type for exactly this reason. Fall back to asking the server.
    let identities = user.identities
    if (!identities) {
      const { data, error } = await supabase.auth.getUserIdentities()
      if (error) {
        console.warn('[Mutu] getUserIdentities (non-fatal):', error.message)
        return
      }
      identities = data?.identities || []
    }

    const google = identities.find(i => i.provider === 'google')
    const googleEmail = String(google?.identity_data?.email || '').toLowerCase().trim()
    if (!googleEmail) return

    const { error } = await supabase.from('user_emails').insert({
      user_id:     user.id,
      email:       googleEmail,
      email_type:  'google',
      is_verified: true,
      verified_at: new Date().toISOString(),
    })
    // 23505 = unique_violation: the row is already there, which is the
    // steady state after the first successful sign-in post-link.
    if (error && error.code !== '23505') {
      console.warn('[Mutu] google identity mirror (non-fatal):', error.message)
    }
  }

  // ── Ensure profile row exists — never block the app on failure ─
  async function ensureProfile(user, { accessType, referredByUserId, joinedWithCode } = {}) {
    try {
      // Before the early return below — existing users are exactly the ones
      // that need this.
      mirrorGoogleIdentity(user).catch(() => {})

      const { data: existing, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (fetchError) {
        console.error('[ReciRing] Profile fetch error (non-fatal):', fetchError)
        setProfile({ id: user.id, email: user.email, name: user.email?.split('@')[0] || 'Member', avatar_url: null })
        setLoading(false)
        return
      }

      if (existing) {
        console.log('[ReciRing] Profile loaded for', user.email)
        setProfile(existing)
        setLoading(false)
        return
      }

      console.log('[ReciRing] Creating new profile for', user.email, 'access_type:', accessType)
      // Derive member_type from the pathway that granted access. Admin
      // check runs last so an admin-listed institutional email still
      // records as 'admin' rather than 'student'.
      const emailLower = String(user.email || '').toLowerCase().trim()
      let memberType = 'student'
      if (accessType === 'invite_code')                   memberType = 'invited'
      else if (accessType === 'referral_code')            memberType = 'invited'
      else if (accessType === 'linked_google'
            || accessType === 'linked_personal_email')    memberType = 'alumni'
      else if (accessType === 'premium'
            || accessType === 'admin_approved')           memberType = 'premium'
      if (isAdmin(emailLower))                            memberType = 'admin'

      const now = new Date().toISOString()
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id:                          user.id,
          email:                       user.email,
          name:                        user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member',
          avatar_url:                  null,
          // The gate above ensures accessType is always set for newly-
          // created profiles. Grandfathered rows already carry 'legacy'
          // from an earlier migration backfill.
          access_type:                 accessType || 'legacy',
          access_status:               'active',
          member_type:                 memberType,
          institutional_verified_at:   accessType === 'institutional_email' ? now : null,
          referred_by_user_id:         referredByUserId || null,
          joined_with_code:            joinedWithCode || null,
        })
        .select()
        .single()

      // Register the session email in user_emails so future logins via
      // this address are recognized as a linked, verified account.
      // Best-effort — a fetch failure here shouldn't block onboarding.
      if (!insertError && user.email) {
        const email_type =
          accessType === 'institutional_email' ? 'institutional' :
          accessType === 'linked_personal_email' ? 'personal' :
          'personal'
        supabase.from('user_emails').insert({
          user_id:     user.id,
          email:       emailLower,
          email_type,
          is_verified: true,
          verified_at: now,
        }).then(({ error: linkErr }) => {
          if (linkErr && linkErr.code !== '23505') {
            // 23505 = unique_violation. Silent when the row is already there.
            console.warn('[Mutu] user_emails insert (non-fatal):', linkErr.message)
          }
        })
      }

      if (insertError) {
        console.error('[ReciRing] Profile create error (non-fatal):', insertError)
        setProfile({ id: user.id, email: user.email, name: user.email?.split('@')[0] || 'Member', avatar_url: null })
      } else {
        setProfile(created)
        // First-time profile creation = first sign-in → trigger welcome email.
        // Fire-and-forget. Server-side dedupe in /api/send-email ensures even
        // if this fires twice (HMR, double-mount, race), only one mail ships.
        if (user.email) {
          sendWelcomeEmail({
            toEmail:     user.email,
            displayName: user.user_metadata?.full_name || user.email.split('@')[0],
          }).then(({ error: emailErr, data }) => {
            if (emailErr) console.warn('[ReciRing] welcome email failed:', emailErr.message)
            else if (data?.skipped) console.log('[ReciRing] welcome skipped:', data.reason)
            else console.log('[ReciRing] welcome email queued:', data?.id)
          })
        }
      }
    } catch (err) {
      console.error('[ReciRing] ensureProfile threw (non-fatal):', err)
      setProfile({ id: user.id, email: user.email, name: 'Member', avatar_url: null })
    } finally {
      setLoading(false)
    }
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: emailRedirect('/auth/confirmed') },
    })
    return { data, error }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    if (isNativeApp) {
      return runNativeOAuth(() =>
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: authRedirect('/auth/callback'),
            queryParams: { prompt: 'select_account' },
            skipBrowserRedirect: true,
          },
        })
      )
    }
    // Web unchanged: full-page redirect to the origin root, handled by
    // detectSessionInUrl. Keeping the exact prior target avoids relying on an
    // allow-list entry the deployed Supabase project may not have.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    })
    return { data, error }
  }

  // Link a Google account to the current session's auth user so the
  // member can sign in with either their institutional email OR their
  // Gmail after graduation. Requires an active session — Supabase's
  // linkIdentity attaches the new provider to the CURRENT auth user
  // rather than creating a new one.
  //
  // Redirects to Google's consent screen and returns via the same
  // callback flow as sign-in. The post-callback gate recognizes the
  // Google email as linked (because auth.identities now includes it,
  // and we mirror the address into user_emails on return).
  async function linkGoogleIdentity() {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    if (!session) return { error: new Error('Sign in first, then link.') }
    if (typeof supabase.auth.linkIdentity !== 'function') {
      return { error: new Error('This Supabase client is too old — update @supabase/supabase-js to link identities.') }
    }
    if (isNativeApp) {
      // mirrorGoogleIdentity on the next auth event records the link in
      // user_emails, so no ?linked=google marker is needed in the app.
      return runNativeOAuth(() =>
        supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: authRedirect('/auth/callback'),
            skipBrowserRedirect: true,
          },
        })
      )
    }
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/?linked=google`,
      },
    })
    return { data, error }
  }

  // Return every email address linked to the current session's auth
  // user, freshest first. Used by the Settings "Linked accounts"
  // section. RLS on user_emails allows any authenticated user to read;
  // filtering to the current user is a client-side courtesy.
  async function listMyLinkedEmails() {
    if (!isSupabaseConfigured || !session?.user?.id) return { data: [], error: null }
    const { data, error } = await supabase
      .from('user_emails')
      .select('id, email, email_type, is_verified, verified_at, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    return { data: data || [], error }
  }

  // Delete a linked email row. Only the row's owner can delete via RLS
  // (see migration-access-model.sql). The primary institutional row
  // that granted eligibility is protected here client-side; the DB
  // wouldn't refuse it but removing your only verification would
  // brick access next login.
  async function unlinkEmail(id) {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    const { error } = await supabase.from('user_emails').delete().eq('id', id)
    return { error }
  }

  // ── SessionStorage helpers ────────────────────────────────────
  //
  // Wrapped so a SecurityError in private-browsing or a locked-down
  // iframe doesn't crash the auth flow. LoginScreen stashes an invite
  // code here before an OAuth redirect; gateAndEnsureProfile reads it
  // when the user lands back.
  function safeReadSession(key) {
    try { return typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null }
    catch { return null }
  }
  function safeClearSession(key) {
    try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(key) }
    catch {}
  }

  function clearAccessDenied() { setAccessDenied(null) }

  async function signOut() {
    if (isSupabaseConfigured) {
      try { await supabase.auth.signOut() }
      catch (err) { console.warn('[ReciRing] signOut error (ignored):', err?.message) }
    }
    setSession(null)
    setProfile(null)
  }

  // Send a password-reset email. Supabase's response is deliberately
  // opaque about whether the address exists (privacy) — the caller
  // should always show a neutral confirmation to match.
  //
  // redirectTo points at the dedicated /reset-password route rather
  // than the app root. The route-based detection in AppRoot is what
  // the recovery flow actually depends on — the PASSWORD_RECOVERY
  // event doesn't reliably fire on the newer PKCE flow (URL uses
  // ?code=... in query, not #type=recovery in hash), and the older
  // implementation missed it silently.
  async function resetPassword(email) {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: emailRedirect('/reset-password'),
    })
    return { data, error }
  }

  // Called after PASSWORD_RECOVERY once the user types a new password.
  // The recovery session lets updateUser through without re-auth. On
  // success we clear the recovery flag so the app resumes normally.
  async function updatePassword(newPassword) {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    const { data, error } = await supabase.auth.updateUser({ password: newPassword })
    if (!error) setPasswordRecovery(false)
    return { data, error }
  }

  async function updateProfile(updates) {
    if (!isSupabaseConfigured || !session?.user) {
      return { error: new Error('Not signed in.') }
    }
    // Only pass JSON-safe scalar/array values — prevents circular refs
    const safe = {}
    for (const [k, v] of Object.entries(updates)) {
      const t = typeof v
      if (t === 'string' || t === 'number' || t === 'boolean' || v === null || Array.isArray(v)) {
        safe[k] = v
      }
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(safe)
        .eq('id', session.user.id)
        .select()
        .single()
      if (error) {
        console.error('[ReciRing] updateProfile error:', error.message || error.code)
        return { error: new Error(error.message || 'Profile update failed') }
      }
      if (data) setProfile(data)
      return { data, error: null }
    } catch (err) {
      console.error('[ReciRing] updateProfile threw:', err?.message)
      return { error: new Error(err?.message || 'Profile update failed') }
    }
  }

  async function deleteAccount() {
    if (!isSupabaseConfigured || !session?.user) {
      return { error: new Error('Not signed in.') }
    }
    const userId = session.user.id
    const { error: delError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)
    if (delError) return { error: delError }

    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    return { partial: true }
  }

  // Derive viewer profile for match ranking from onboarding data
  const viewerProfile = (profile?.can_help_with?.length && profile?.industry_interests?.length)
    ? { strengths: profile.can_help_with, industries: profile.industry_interests }
    : null

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      viewerProfile,
      loading,
      isConfigured: isSupabaseConfigured,
      signUp,
      signIn,
      signInWithGoogle,
      linkGoogleIdentity,
      listMyLinkedEmails,
      unlinkEmail,
      signOut,
      resetPassword,
      updatePassword,
      passwordRecovery,
      accessDenied,
      clearAccessDenied,
      updateProfile,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
