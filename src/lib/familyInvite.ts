// One-time family invites (migration 0082, owner decision 2026-11-24 #4). Each call makes a NEW code: one use, expires after
// INVITE_TTL_HOURS. The server stores only a hash, so the code can be shown only right after it is created.
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

/** Mirrors invite_ttl in create_family_invite() (0082); change both together. */
export const INVITE_TTL_HOURS = 24

export interface FamilyInvite {
  code: string
  expiresAt: string
}

export async function createFamilyInvite(): Promise<{ invite: FamilyInvite | null; error: string | null }> {
  if (!supabase) return { invite: null, error: 'Esto no está disponible ahora. Probá más tarde.' }
  const { data, error } = await supabase.rpc('create_family_invite')
  if (error) return { invite: null, error: toFriendlyError(error) }
  const row = Array.isArray(data) ? data[0] : null
  if (!row?.code) return { invite: null, error: 'No pudimos crear el código. Probá de nuevo.' }
  return { invite: { code: row.code, expiresAt: row.expires_at }, error: null }
}

/** "ABCD EFGH": easier to read aloud; the server ignores spaces and dashes. */
export function formatInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}

export function inviteShareText(code: string): string {
  return (
    `Te sumo a mi Vigo en WikiVigo. Entrá a Mi Vigo › Tu cuenta › «¿Te pasaron un código?» y escribí ${code}. ` +
    `Sirve para una persona y vence en ${INVITE_TTL_HOURS} h.`
  )
}
