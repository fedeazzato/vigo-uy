/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** "1" shows the Bóveda inbox (specs/vault-onboarding.md Phase C); only after migration 0049 is applied. */
  readonly VITE_VAULT_INBOX?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
