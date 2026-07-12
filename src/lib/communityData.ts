// Shared fetch layer for community (Supabase-backed) content, used by the
// public wiki pages (Rutas, Costos, Mi Vigo) and the community feed so they
// don't each reimplement fetching, author-name resolution, and error state.
// Every function null-guards `supabase` and resolves to empty results, so the
// pages render curated JSON only when the backend isn't configured.
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type {
  CityCostStat,
  CommunityTotals,
  ModelTripStat,
  PartPurchase,
  PublicProfile,
  ServiceEntry,
  TripLog,
  VehicleLeaderboardEntry,
} from '../types'

export async function fetchPublicTrips(limit: number): Promise<{ trips: TripLog[]; error: string | null }> {
  if (!supabase) return { trips: [], error: null }
  const { data, error } = await supabase
    .from('trip_logs')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { trips: (data ?? []) as TripLog[], error: error?.message ?? null }
}

export async function fetchPublicServiceEntries(
  limit: number
): Promise<{ entries: ServiceEntry[]; error: string | null }> {
  if (!supabase) return { entries: [], error: null }
  const { data, error } = await supabase
    .from('service_entries')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { entries: (data ?? []) as ServiceEntry[], error: error?.message ?? null }
}

export async function fetchPublicPartPurchases(
  limit: number
): Promise<{ purchases: PartPurchase[]; error: string | null }> {
  if (!supabase) return { purchases: [], error: null }
  const { data, error } = await supabase
    .from('part_purchases')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { purchases: (data ?? []) as PartPurchase[], error: error?.message ?? null }
}

// Resolves author display names through the public_profiles view, which is
// readable without a session (the profiles table is not).
export async function fetchAuthorNames(userIds: string[]): Promise<Record<string, string>> {
  if (!supabase || userIds.length === 0) return {}
  const { data } = await supabase.from('public_profiles').select('id, display_name').in('id', userIds)
  const map: Record<string, string> = {}
  for (const p of (data ?? []) as PublicProfile[]) map[p.id] = p.display_name
  return map
}

export async function fetchCommunityStats(): Promise<{
  cityStats: CityCostStat[]
  modelStats: ModelTripStat[]
  error: string | null
}> {
  if (!supabase) return { cityStats: [], modelStats: [], error: null }
  const [cityRes, modelRes] = await Promise.all([
    supabase.from('service_cost_stats_by_city').select('*'),
    supabase.from('trip_stats_by_model').select('*'),
  ])
  return {
    cityStats: (cityRes.data ?? []) as CityCostStat[],
    modelStats: (modelRes.data ?? []) as ModelTripStat[],
    error: cityRes.error?.message ?? modelRes.error?.message ?? null,
  }
}

export async function fetchLeaderboard(): Promise<{ rows: VehicleLeaderboardEntry[]; error: string | null }> {
  if (!supabase) return { rows: [], error: null }
  const { data, error } = await supabase.from('vehicle_km_leaderboard').select('*')
  return { rows: (data ?? []) as VehicleLeaderboardEntry[], error: error?.message ?? null }
}

export async function fetchCommunityTotals(): Promise<{ totals: CommunityTotals | null; error: string | null }> {
  if (!supabase) return { totals: null, error: null }
  const { data, error } = await supabase.from('community_totals').select('*').single()
  return { totals: (data as CommunityTotals) ?? null, error: error?.message ?? null }
}

export interface CommunityContent {
  trips: TripLog[]
  entries: ServiceEntry[]
  purchases: PartPurchase[]
  names: Record<string, string>
  loading: boolean
  error: string | null
}

// Public trips / service entries / part purchases plus resolved author
// names — the pattern previously inlined in CommunityFeedPage.
export function useCommunityContent(options?: {
  trips?: boolean
  entries?: boolean
  purchases?: boolean
  limit?: number
}): CommunityContent {
  const wantTrips = options?.trips ?? true
  const wantEntries = options?.entries ?? true
  const wantPurchases = options?.purchases ?? false
  const limit = options?.limit ?? 30

  const [trips, setTrips] = useState<TripLog[]>([])
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [purchases, setPurchases] = useState<PartPurchase[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    async function load() {
      const [tripsRes, entriesRes, purchasesRes] = await Promise.all([
        wantTrips ? fetchPublicTrips(limit) : Promise.resolve({ trips: [] as TripLog[], error: null }),
        wantEntries
          ? fetchPublicServiceEntries(limit)
          : Promise.resolve({ entries: [] as ServiceEntry[], error: null }),
        wantPurchases
          ? fetchPublicPartPurchases(limit)
          : Promise.resolve({ purchases: [] as PartPurchase[], error: null }),
      ])
      if (cancelled) return

      setTrips(tripsRes.trips)
      setEntries(entriesRes.entries)
      setPurchases(purchasesRes.purchases)
      setError(tripsRes.error ?? entriesRes.error ?? purchasesRes.error)

      const userIds = [
        ...new Set([
          ...tripsRes.trips.map((t) => t.user_id),
          ...entriesRes.entries.map((e) => e.user_id),
          ...purchasesRes.purchases.map((p) => p.user_id),
        ]),
      ]
      const nameMap = await fetchAuthorNames(userIds)
      if (cancelled) return
      setNames(nameMap)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [wantTrips, wantEntries, wantPurchases, limit])

  return { trips, entries, purchases, names, loading, error }
}
