import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { AuthError, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types'

type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'disabled'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  status: AuthStatus
  sendOtp: (email: string, captchaToken?: string | null) => Promise<{ error: AuthError | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  // Re-fetches the profile row (e.g. after ProfilePage saves changes) so the
  // sidebar and role-gated UI reflect the latest data.
  refreshProfile: () => Promise<void>
  // Passkeys are a Supabase Auth Beta feature ("may change without notice"),
  // so every call here is wrapped defensively — email OTP always remains the
  // primary, permanent login path regardless of whether these work.
  passkeysSupported: boolean
  registerPasskey: () => Promise<{ error: Error | null }>
  signInWithPasskey: () => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'disabled')

  useEffect(() => {
    if (!supabase) return

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setStatus(session ? 'signedIn' : 'signedOut')
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile((data as Profile) ?? null)
  }, [user])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  async function sendOtp(email: string, captchaToken?: string | null) {
    if (!supabase) return { error: new Error('Supabase no configurado') as AuthError }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, captchaToken: captchaToken ?? undefined },
    })
    return { error }
  }

  async function verifyOtp(email: string, token: string) {
    if (!supabase) return { error: new Error('Supabase no configurado') as AuthError }
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    return { error }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const passkeysSupported =
    Boolean(supabase) &&
    typeof supabase?.auth.registerPasskey === 'function' &&
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential)

  async function registerPasskey() {
    if (!supabase) return { error: new Error('Supabase no configurado') }
    try {
      const { error } = await supabase.auth.registerPasskey()
      return { error }
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('No se pudo registrar la llave de acceso') }
    }
  }

  async function signInWithPasskey() {
    if (!supabase) return { error: new Error('Supabase no configurado') }
    try {
      const { error } = await supabase.auth.signInWithPasskey()
      return { error }
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('No se pudo iniciar sesión con la llave de acceso') }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        status,
        sendOtp,
        verifyOtp,
        signOut,
        refreshProfile,
        passkeysSupported,
        registerPasskey,
        signInWithPasskey,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
