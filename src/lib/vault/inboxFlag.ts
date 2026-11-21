// The Bóveda inbox UI (specs/vault-onboarding.md Phase C) stays hidden, and its
// tables are never queried, until migration 0049 is applied and the site is
// built with VITE_VAULT_INBOX=1. A module of its own so tests can switch it.
export const VAULT_INBOX_ENABLED: boolean = import.meta.env.VITE_VAULT_INBOX === '1'
