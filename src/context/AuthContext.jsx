import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
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

  async function updateProfile(updates) {
    if (!isSupabaseConfigured || !session?.user) {
      return { error: new Error('Not signed in.') }
    }
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select()
      .single()
    if (!error && data) setProfile(data)
    return { data, error }
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

  const viewerProfile = null

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
