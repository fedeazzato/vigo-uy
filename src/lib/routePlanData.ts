// Network side of the route planner (specs/route-plans.md): community trips
// for the consumption estimate, and the signed-in user's saved plans
// (route_plans, migration 0057).
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import type { Json, Tables } from './database.types'
import type { TripLog } from '../types'
import type { Plan, PlanQuery } from './routePlan'

export type SavedRoutePlan = Tables<'route_plans'>

let tripsPromise: Promise<TripLog[]> | null = null

// Public trips long enough to say something about road consumption. RLS
// already limits anon/auth reads to public, non-hidden rows of non-banned
// authors; the filters here just keep the payload small.
export function fetchConsumptionTrips(): Promise<TripLog[]> {
  const client = supabase
  if (!client) return Promise.resolve([])
  if (!tripsPromise) {
    tripsPromise = Promise.resolve(
      client
        .from('trip_logs')
        .select('*')
        .eq('is_public', true)
        .eq('hidden', false)
        .gte('distance_km', 40)
        .order('trip_date', { ascending: false })
        .limit(500)
    ).then(({ data, error }) => {
      if (error) tripsPromise = null
      return (data ?? []) as unknown as TripLog[]
    })
  }
  return tripsPromise
}

export function planSnapshot(plan: Plan, distanceKm: number): Json {
  return {
    distance_km: Math.round(distanceKm),
    arrival_soc: Math.round(plan.arrivalSoc),
    feasible: plan.feasible,
    stops: plan.stops.map((s) => ({
      station_id: s.candidate.id,
      name: s.candidate.name,
      km: Math.round(s.candidate.alongKm),
      arrival_soc: Math.round(s.arrivalSoc),
      departure_soc: Math.round(s.departureSoc),
    })),
  }
}

export async function saveRoutePlan(
  query: PlanQuery,
  kwhPer100: number,
  snapshot: Json
): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const { error } = await client.from('route_plans').insert({
    title: `${query.origin} → ${query.destination}`.slice(0, 120),
    origin: query.origin,
    destination: query.destination,
    model: query.model,
    start_soc: query.startSoc,
    min_arrival_soc: query.minArrivalSoc,
    consumption_kwh_100km: kwhPer100,
    snapshot,
  })
  return { error: error ? toFriendlyError(error) : null }
}

export async function fetchMyRoutePlans(): Promise<{ plans: SavedRoutePlan[]; error: string | null }> {
  const client = supabase
  if (!client) return { plans: [], error: null }
  const { data, error } = await client
    .from('route_plans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  return { plans: data ?? [], error: error ? toFriendlyError(error) : null }
}

export async function deleteRoutePlan(id: string): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const { error } = await client.from('route_plans').delete().eq('id', id)
  return { error: error ? toFriendlyError(error) : null }
}
