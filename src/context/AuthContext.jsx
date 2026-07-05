import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { sendWelcomeEmail } from '../lib/email'

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
        if (s) ensureProfile(s.user)
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
        if (s) ensureProfile(s.user)
        else { setProfile(null); setLoading(false) }
      },
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  // ── Ensure profile row exists — never block the app on failure ─
  async function ensureProfile(user) {
    try {
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

      console.log('[ReciRing] Creating new profile for', user.email)
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id:         user.id,
          email:      user.email,
          name:       user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member',
          avatar_url: null,
        })
        .select()
        .single()

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
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmed` },
    })
    return { data, error }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    })
    return { data, error }
  }

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
  // should always show a neutral confirmation to match. redirectTo
  // brings the user back to the app; Supabase auto-detects the
  // recovery hash and fires PASSWORD_RECOVERY which flips the UI into
  // set-new-password mode.
  async function resetPassword(email) {
    if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
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
      signOut,
      resetPassword,
      updatePassword,
      passwordRecovery,
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
