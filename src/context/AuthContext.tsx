import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AuthError, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'disabled'

interface AuthContextValue {
  user: User | null
  status: AuthStatus
  sendOtp: (email: string) => Promise<{ error: AuthError | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'disabled')

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setStatus(session ? 'signedIn' : 'signedOut')
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  async function sendOtp(email: string) {
    if (!supabase) return { error: new Error('Supabase no configurado') as AuthError }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
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

  return (
    <AuthContext.Provider value={{ user, status, sendOtp, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
