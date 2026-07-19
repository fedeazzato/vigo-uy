import { createClient, SupabaseClient } from '@supabase/supabase-js'
// Generated from the live schema — regenerate with `npm run gen:types`
// after every migration.
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient<Database> | null = null

if (url && anonKey) {
  client = createClient<Database>(url, anonKey, {
    auth: {
      // OTP codes carry no session in the URL, so this avoids any ambiguity
      // with HashRouter's own use of location.hash.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      // Passkey support (registerPasskey/signInWithPasskey) is gated behind
      // this opt-in; without it auth-js throws on every passkey call.
      experimental: { passkey: true },
    },
  })
} else {
  console.warn(
    'Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — auth and community features are disabled.'
  )
}

export const supabase = client
