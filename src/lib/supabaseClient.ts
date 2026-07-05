import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

if (url && anonKey) {
  client = createClient(url, anonKey, {
    auth: {
      // OTP codes carry no session in the URL, so this avoids any ambiguity
      // with HashRouter's own use of location.hash.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
} else {
  console.warn(
    'Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — auth and community features are disabled.'
  )
}

export const supabase = client
