import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// E2 family sharing (specs/family-car-roles.md, migration 0070): the caller's role on their vehicle's car.
// owner = the vehicle's creator; control = may send orders and link/unlink the car; view = sees status and notices only.
export type CarRole = 'owner' | 'control' | 'view'
export type MemberCarRole = 'control' | 'view'

export const ROLE_LABELS: Record<MemberCarRole, string> = {
  view: 'Solo ver el auto',
  control: 'Ver y controlar el auto',
}

export const VIEW_ONLY_NOTICE =
  'Tu permiso en este vehículo es solo ver: podés ver el estado y los avisos del auto, pero no enviarle órdenes. ' +
  'Pedile a quien creó el vehículo que te dé control.'

export function isCarRole(v: unknown): v is CarRole {
  return v === 'owner' || v === 'control' || v === 'view'
}

/** null when unknown (no session, or the migration is not applied yet): callers then keep today's behaviour. */
export async function fetchMyCarRole(): Promise<CarRole | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('my_car_role')
  if (error) return null
  return isCarRole(data) ? data : null
}

export function canControl(role: CarRole | null): boolean {
  return role !== 'view'
}

export async function setMemberCarRole(
  userId: string,
  role: MemberCarRole
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Esto no está disponible ahora. Probá más tarde.' }
  const { error } = await supabase.rpc('set_vehicle_member_role', { p_user: userId, p_role: role })
  return { error: error ? toFriendlyError(error) : null }
}
