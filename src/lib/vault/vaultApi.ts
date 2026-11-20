// Supabase access for the vault (migration 0046). Every value sent here is
// already ciphertext, a wrapped key, a salt, a credential id or a label;
// RLS restricts every statement to the caller's own rows and user_id always
// comes from the column default (auth.uid()), never from the client.
import { supabase } from '../supabaseClient'
import { toFriendlyError } from '../errors'
import type { VaultItemKind, VaultItemRow, VaultKeyRow } from '../../types'

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
