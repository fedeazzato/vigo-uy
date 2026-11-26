// "Probar versiones beta" (specs/car-updates.md "Pedir beta", migration 0084): the owner asks to join beta testing of car updates
// from Mi Vigo; the release maintainer approves or rejects in Moderación › Versiones del auto. Read only through my_car_beta(),
// which answers allowed:false for view-only members and people without a vehicle. Every read error -- including the function not
// existing before 0084 is applied -- yields null: the card stays hidden and the page never breaks.
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

export type BetaRequestStatus = 'pending' | 'approved' | 'rejected'

export interface BetaRequest {
  status: BetaRequestStatus
  createdAt: string
  decidedAt: string | null
}

export type CarBetaState = { allowed: false } | { allowed: true; beta: boolean; request: BetaRequest | null }

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** my_car_beta's JSON, checked field by field; null for anything unexpected. */
export function parseCarBeta(raw: unknown): CarBetaState | null {
  const o = record(raw)
  if (!o || typeof o.allowed !== 'boolean') return null
  if (!o.allowed) return { allowed: false }
  if (typeof o.beta !== 'boolean') return null
  let request: BetaRequest | null = null
  const r = record(o.request)
  if (
    r &&
    (r.status === 'pending' || r.status === 'approved' || r.status === 'rejected') &&
    typeof r.created_at === 'string'
  ) {
    request = {
      status: r.status,
      createdAt: r.created_at,
      decidedAt: typeof r.decided_at === 'string' ? r.decided_at : null,
    }
  }
  return { allowed: true, beta: o.beta, request }
}

export type BetaCardMode = 'beta' | 'pending' | 'rejected' | 'none'

/** What the card shows: in beta (Salir), pending (Pedido enviado), last request rejected (ask again), or the plain offer. */
export function betaCardMode(s: { beta: boolean; request: BetaRequest | null }): BetaCardMode {
  if (s.beta) return 'beta'
  if (s.request?.status === 'pending') return 'pending'
  if (s.request?.status === 'rejected') return 'rejected'
  return 'none'
}

export const BETA_EXPLAINER =
  'Tu auto recibe las versiones nuevas de las mejoras antes que el resto. Pueden tener algún error chico, y podés salir cuando quieras.'

export async function fetchCarBeta(): Promise<CarBetaState | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('my_car_beta')
    if (error) return null
    return parseCarBeta(data)
  } catch {
    return null
  }
}

/** Returns an error message, or null when the request is pending (or the car already is beta). */
export async function requestCarBeta(): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('request_car_beta')
  return error ? toFriendlyError(error) : null
}

/** "Salir de beta" and "Cancelar pedido". */
export async function leaveCarBeta(): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('leave_car_beta')
  return error ? toFriendlyError(error) : null
}

// ---- Moderación › Versiones del auto ----

export interface BetaRequestAdminRow {
  id: string
  vehicle_id: string
  members: string | null
  requested_by_name: string | null
  created_at: string
  linked: boolean
  beta: boolean
}

export async function fetchBetaRequests(): Promise<{ rows: BetaRequestAdminRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: null }
  const { data, error } = await supabase.rpc('admin_list_car_beta_requests')
  // PGRST202 = function not found: migration 0084 not applied yet, so there are simply no requests to show.
  if (error && (error as { code?: string }).code === 'PGRST202') return { rows: [], error: null }
  return { rows: data ?? [], error: error ? toFriendlyError(error) : null }
}

export async function decideBetaRequest(id: string, approve: boolean): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('admin_decide_car_beta_request', { p_request: id, p_approve: approve })
  return error ? toFriendlyError(error) : null
}
