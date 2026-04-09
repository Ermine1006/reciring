import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  // ── Bootstrap ────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) ensureProfile(s.user)
      else setLoading(false)
    }).catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s)
        if (s) ensureProfile(s.user)
        else { setProfile(null); setLoading(false) }
      },
    )
    return () => subscription.unsubscribe()
  }, [])

  // ── Ensure profile row exists (auto-create on first sign-in) ─
  async function ensureProfile(user) {
    // Try to fetch existing profile
    const { data: existing, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
      console.error('Profile fetch error:', fetchError)
      setLoading(false)
      return
    }

    if (existing) {
      setProfile(existing)
      setLoading(false)
      return
    }

    // No row yet — create one with defaults
    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id:           user.id,
        email:        user.email,
        name:         'Anonymous',
        avatar_url:   null,
        is_anonymous: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Profile create error:', insertError)
    } else {
      setProfile(created)
    }
    setLoading(false)
  }

  // ── Sign up ──────────────────────────────────────────────────
  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    return { data, error }
  }

  // ── Sign in ──────────────────────────────────────────────────
  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  // ── Sign out ─────────────────────────────────────────────────
  async function signOut() {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  // ── Update profile ───────────────────────────────────────────
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

  // ── Delete account ───────────────────────────────────────────
  // Client-side can only delete the user's own row in `profiles`
  // (RLS allows it). Removing the auth.users record requires the
  // service-role key — must be done via an Edge Function or admin
  // endpoint. We delete app data + sign out, and report `partial`.
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

  // ── Derived viewer profile for match ranking (fallback) ──────
  const viewerProfile = null  // new schema doesn't carry strengths/industries; CardStack uses DEFAULT

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
