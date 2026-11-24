import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// C4 vehicle config fingerprint (specs/vehicle-config-fingerprint.md, migration 0071). The installer writes
// "configuracion_del_auto.txt" (installer/car/install_all.sh fingerprint): key=value lines. The owner uploads it here; rows are
// private to the account (RLS user_id = auth.uid()), never shared with other members of the vehicle.

export type ConfigLabel = 'instalacion' | 'antes_del_service' | 'despues_del_service' | 'manual'

export const LABEL_TEXT: Record<ConfigLabel, string> = {
  instalacion: 'Al instalar',
  antes_del_service: 'Antes del service',
  despues_del_service: 'Después del service',
  manual: 'Copia manual',
}

export interface ConfigSnapshot {
  id?: string
  label: ConfigLabel
  taken_at: string
  firmware: string | null
  config_head: string
  config_tail: string
  items: Record<string, string | number>
}

const BYTES = /^[0-9]{1,3}(-[0-9]{1,3}){0,127}$/
const ITEM_KEYS = ['item119', 'item134', 'item161', 'gps_source'] as const

/** What each decoded item means (settings_backup/README.md, record.vehicle). */
export const ITEM_TEXT: Record<string, string> = {
  item119: 'Opción 119',
  item134: 'Mercado (ítem 134)',
  item161: 'Opción 161',
  gps_source: 'Fuente del GPS',
}

function isLabel(v: string): v is ConfigLabel {
  return v in LABEL_TEXT
}

/** Parses the installer file; null when it is not one (no "vigo-vehicle-config 1" header or no head bytes). */
export function parseConfigFile(text: string): ConfigSnapshot | null {
  const lines = text.replace(/\r/g, '').split('\n')
  if (lines[0]?.trim() !== 'vigo-vehicle-config 1') return null
  const kv: Record<string, string> = {}
  for (const l of lines.slice(1)) {
    const i = l.indexOf('=')
    if (i > 0) kv[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  }
  const head = kv.head ?? ''
  const tail = kv.tail ?? ''
  if (!BYTES.test(head) || (tail !== '' && !BYTES.test(tail))) return null
  const taken = kv.taken ? new Date(kv.taken) : null
  const items: Record<string, string | number> = {}
  for (const k of ITEM_KEYS) {
    const v = kv[k]
    if (v === undefined || v === '' || !/^[A-Za-z0-9_.-]{1,20}$/.test(v)) continue
    items[k] = /^[0-9]+$/.test(v) && k !== 'gps_source' ? Number(v) : v
  }
  const firmware = kv.firmware && /^[A-Za-z0-9_.-]{1,80}$/.test(kv.firmware) ? kv.firmware : null
  return {
    label: kv.label && isLabel(kv.label) ? kv.label : 'manual',
    taken_at: taken && !Number.isNaN(taken.getTime()) ? taken.toISOString() : new Date().toISOString(),
    firmware,
    config_head: head,
    config_tail: tail,
    items,
  }
}

export interface ConfigChange {
  what: string
  before: string
  after: string
}

/** Differences between two snapshots: decoded items first (they say what changed), then every changed byte. */
export function diffSnapshots(a: ConfigSnapshot, b: ConfigSnapshot): ConfigChange[] {
  const out: ConfigChange[] = []
  const keys = new Set([...Object.keys(a.items), ...Object.keys(b.items)])
  for (const k of [...keys].sort()) {
    const x = a.items[k] === undefined ? '—' : String(a.items[k])
    const y = b.items[k] === undefined ? '—' : String(b.items[k])
    if (x !== y) out.push({ what: ITEM_TEXT[k] ?? k, before: x, after: y })
  }
  if ((a.firmware ?? '') !== (b.firmware ?? '')) {
    out.push({ what: 'Versión de software', before: a.firmware ?? '—', after: b.firmware ?? '—' })
  }
  const bytes = (s: ConfigSnapshot) => [s.config_head, s.config_tail].filter(Boolean).join('-').split('-')
  const ba = bytes(a)
  const bb = bytes(b)
  for (let i = 0; i < Math.max(ba.length, bb.length); i++) {
    if (ba[i] !== bb[i]) out.push({ what: `Byte ${i}`, before: ba[i] ?? '—', after: bb[i] ?? '—' })
  }
  return out
}

export async function fetchSnapshots(): Promise<ConfigSnapshot[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('vehicle_config_snapshots')
    .select('id, label, taken_at, firmware, config_head, config_tail, items')
    .order('taken_at', { ascending: false })
  if (error) return null
  return (data ?? []).map((r) => ({
    ...r,
    label: isLabel(r.label) ? r.label : 'manual',
    items: (r.items ?? {}) as Record<string, string | number>,
  }))
}

export async function saveSnapshot(s: ConfigSnapshot): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Esto no está disponible ahora. Probá más tarde.' }
  const { error } = await supabase.from('vehicle_config_snapshots').insert({
    label: s.label,
    taken_at: s.taken_at,
    firmware: s.firmware,
    config_head: s.config_head,
    config_tail: s.config_tail,
    items: s.items,
  })
  return { error: error ? toFriendlyError(error) : null }
}

export async function deleteSnapshot(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Esto no está disponible ahora. Probá más tarde.' }
  const { error } = await supabase.from('vehicle_config_snapshots').delete().eq('id', id)
  return { error: error ? toFriendlyError(error) : null }
}
