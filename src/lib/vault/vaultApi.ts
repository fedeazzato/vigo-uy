// Supabase access for the vault (migration 0046). Every value sent here is
// already ciphertext, a wrapped key, a salt, a credential id or a label;
// RLS restricts every statement to the caller's own rows and user_id always
// comes from the column default (auth.uid()), never from the client.
import { supabase } from '../supabaseClient'
import { toFriendlyError } from '../errors'
import type { VaultInboxKeyRow, VaultInboxRow, VaultItemKind, VaultItemRow, VaultKeyRow } from '../../types'

const UNAVAILABLE_MESSAGE = 'La bóveda no está disponible en este momento.'
export const VAULT_KEY_COLUMNS = 'credential_id, prf_salt, wrapped_dk, label, created_at'
export const VAULT_ITEM_COLUMNS = 'kind, version, iv, ciphertext, updated_at'

export interface VaultSnapshot {
  keys: VaultKeyRow[]
  items: VaultItemRow[]
}

export async function fetchVault(): Promise<VaultSnapshot & { error: string | null }> {
  if (!supabase) return { keys: [], items: [], error: UNAVAILABLE_MESSAGE }
  const [keys, items] = await Promise.all([
    supabase.from('vault_keys').select(VAULT_KEY_COLUMNS).order('created_at', { ascending: true }),
    supabase.from('vault_items').select(VAULT_ITEM_COLUMNS),
  ])
  const error = keys.error ?? items.error
  if (error) return { keys: [], items: [], error: toFriendlyError(error) }
  return {
    keys: keys.data ?? [],
    items: (items.data ?? []) as VaultItemRow[],
    error: null,
  }
}

export interface NewVaultKey {
  credential_id: string
  prf_salt: string
  wrapped_dk: string
  label: string
}

export async function insertVaultKey(row: NewVaultKey): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { error } = await supabase.from('vault_keys').insert(row)
  return { error: error ? toFriendlyError(error) : null }
}

export async function deleteVaultKey(credentialId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { error } = await supabase.from('vault_keys').delete().eq('credential_id', credentialId)
  return { error: error ? toFriendlyError(error) : null }
}

export interface EncryptedVaultItem {
  kind: VaultItemKind
  version: number
  iv: string
  ciphertext: string
}

/**
 * Update-then-insert (kind is not updatable, so a PostgREST upsert, which
 * sets every payload column, would be refused by the column grants).
 */
export async function saveVaultItem(item: EncryptedVaultItem): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { version, iv, ciphertext } = item
  const updated = await supabase
    .from('vault_items')
    .update({ version, iv, ciphertext })
    .eq('kind', item.kind)
    .select('kind')
  if (updated.error) return { error: toFriendlyError(updated.error) }
  if ((updated.data ?? []).length > 0) return { error: null }
  const inserted = await supabase.from('vault_items').insert({ kind: item.kind, version, iv, ciphertext })
  return { error: inserted.error ? toFriendlyError(inserted.error) : null }
}

export async function deleteVaultItem(kind: VaultItemKind): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { error } = await supabase.from('vault_items').delete().eq('kind', kind)
  return { error: error ? toFriendlyError(error) : null }
}

// ── Inbox (migration 0049, specs/vault-onboarding.md Phase C) ─────────────────
// Only called when VAULT_INBOX_ENABLED (the tables do not exist before 0049).

export interface InboxSnapshot {
  key: VaultInboxKeyRow | null
  rows: VaultInboxRow[]
}

export async function fetchInbox(): Promise<InboxSnapshot & { error: string | null }> {
  if (!supabase) return { key: null, rows: [], error: UNAVAILABLE_MESSAGE }
  const [key, rows] = await Promise.all([
    supabase.from('vault_inbox_keys').select('key_id, public_key, created_at').maybeSingle(),
    supabase.from('vault_inbox').select('id, kind, key_id, epk, iv, ciphertext, created_at'),
  ])
  const error = key.error ?? rows.error
  if (error) return { key: null, rows: [], error: toFriendlyError(error) }
  return { key: key.data ?? null, rows: rows.data ?? [], error: null }
}

const INBOX_FALLBACK =
  'Mientras tanto podés guardarla igual: en la tarjeta «Frase de recuperación de la dashcam» de esta página, escribí las 24 palabras (en el auto: Dashcam › Ajustes › Frase de recuperación › Ver las palabras).'

/** Shown when the server refuses the inbox key (42501): not the user's session, so "cerrá sesión" would not help. */
export const INBOX_KEY_REFUSED_MESSAGE =
  'El servidor de WikiVigo rechazó la llave para recibir la frase del auto. No es tu cuenta ni tu auto: falta un ajuste del lado de WikiVigo y cerrar sesión no lo arregla. Avisanos y probá de nuevo en unos días. ' +
  INBOX_FALLBACK

/** Shown when the inbox tables are not on the server yet (migration 0049 not applied). */
export const INBOX_NOT_AVAILABLE_MESSAGE =
  'Recibir la frase desde el auto todavía no está habilitado en el servidor de WikiVigo. ' + INBOX_FALLBACK

/**
 * Errors of «Permitir que el auto envíe la frase». The generic 42501 text
 * ("No tenés permiso… cerrá sesión") misled the owner on 2026-11-26: the
 * cause was server-side (0086), nothing the user could fix.
 */
export function inboxKeyErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  if (code === '42501') return INBOX_KEY_REFUSED_MESSAGE
  if (code === '42P01' || code === 'PGRST205') return INBOX_NOT_AVAILABLE_MESSAGE
  return toFriendlyError(error)
}

/** Publishes the inbox public key (replacing an older one) and returns its new key_id. */
export async function publishInboxKey(publicKey: string): Promise<{ keyId: string | null; error: string | null }> {
  if (!supabase) return { keyId: null, error: UNAVAILABLE_MESSAGE }
  const removed = await supabase.from('vault_inbox_keys').delete().not('key_id', 'is', null)
  if (removed.error) return { keyId: null, error: inboxKeyErrorMessage(removed.error) }
  const { data, error } = await supabase.from('vault_inbox_keys').insert({ public_key: publicKey }).select('key_id').single()
  if (error) return { keyId: null, error: inboxKeyErrorMessage(error) }
  return { keyId: data.key_id, error: null }
}

export async function deleteInboxKey(): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { error } = await supabase.from('vault_inbox_keys').delete().not('key_id', 'is', null)
  return { error: error ? toFriendlyError(error) : null }
}

export async function deleteInboxRow(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { error } = await supabase.from('vault_inbox').delete().eq('id', id)
  return { error: error ? toFriendlyError(error) : null }
}
