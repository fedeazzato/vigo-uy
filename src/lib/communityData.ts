// Shared fetch layer for community (Supabase-backed) content, used by the
// public wiki pages (Rutas, Costos, Mi Vigo) and the community feed so they
// don't each reimplement fetching, author-name resolution, and error state.
// Every function null-guards `supabase` and resolves to empty results, so the
// pages render curated JSON only when the backend isn't configured.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { formatCurrency } from './format'
import { purchaseCategoryTitle } from './purchaseCatalog'
import type {
  ChargingCostStat,
  ChargingNetwork,
  ChargingStation,
  CityCostStat,
  CommunitySearchResult,
  CommunityTotals,
  ContentComment,
  ContentReaction,
  ModelTripStat,
  PartPurchase,
  PublicProfile,
  ReactableContent,
  ServiceEntry,
  StatItem,
  StationReliability,
  TripLog,
  VehicleLeaderboardEntry,
} from '../types'

// ── TTL cache ─────────────────────────────────────────────────────────────
// Pages remount on every navigation and would otherwise refetch the same
// community rows each time (repeated skeletons on mobile, avoidable egress).
// Caching the *promise* also dedupes identical requests fired by components
// mounting simultaneously. Deliberately not a client-cache framework: a TTL
// memo is all this app needs (no new dependency).

const TTL_MS = 60_000
const cache = new Map<string, { promise: Promise<unknown>; at: number }>()

function cached<T>(key: string, fn: () => Promise<T>, failed?: (result: T) => boolean): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T>
  const promise = fn().then(
    (result) => {
      // Failures are not cached; the next mount retries.
      if (failed?.(result)) cache.delete(key)
      return result
    },
    (err) => {
      cache.delete(key)
      throw err
    }
  )
  cache.set(key, { promise, at: Date.now() })
  return promise
}

// Call after every successful community-content mutation (insert/update/
// delete/hide) so the next page visit sees fresh data instead of a stale
// 60-second snapshot.
export function invalidateCommunityCache(): void {
  cache.clear()
}

// The static→dynamic gate (audit item D1): curated JSON is placeholder
// filler transcribed from the WhatsApp group; once a section has enough
// real community rows, the community data takes over. Trivial on purpose —
// the value is the uniform convention and the tagged `source` forcing
// callers to render provenance. Thresholds per section are documented in
// specs/CONTENT-MIGRATION.md.
// TODO(D2 hook): thresholds may later count only moderator-verified rows.
export function preferCommunity<T, U>(options: {
  curated: T
  community: U[]
  minSamples: number
}): { source: 'comunidad'; data: U[] } | { source: 'grupo'; data: T } {
  const { curated, community, minSamples } = options
  if (community.length >= minSamples) return { source: 'comunidad', data: community }
  return { source: 'grupo', data: curated }
}

// Moderator-verified rows first, otherwise preserving the given order
// (Array.prototype.sort is stable). Used wherever community content renders
// so "Oficial" entries lead their section.
export function verifiedFirst<T extends { verified: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.verified) - Number(a.verified))
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

function fetchPublicTrips(limit: number): Promise<{ trips: TripLog[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ trips: [], error: null })
  return cached(
    `publicTrips:${limit}`,
    async () => {
      const { data, error } = await client
        .from('trip_logs')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      return { trips: (data ?? []) as TripLog[], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

function fetchPublicServiceEntries(
  limit: number
): Promise<{ entries: ServiceEntry[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ entries: [], error: null })
  return cached(
    `publicServiceEntries:${limit}`,
    async () => {
      const { data, error } = await client
        .from('service_entries')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      return { entries: data ?? [], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

function fetchPublicPartPurchases(
  limit: number
): Promise<{ purchases: PartPurchase[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ purchases: [], error: null })
  return cached(
    `publicPartPurchases:${limit}`,
    async () => {
      const { data, error } = await client
        .from('part_purchases')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      return { purchases: data ?? [], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

// Resolves author display names through the public_profiles view, which is
// readable without a session (the profiles table is not).
export function fetchAuthorNames(userIds: string[]): Promise<Record<string, string>> {
  const client = supabase
  if (!client || userIds.length === 0) return Promise.resolve({})
  const key = `authorNames:${[...userIds].sort().join(',')}`
  return cached(key, async () => {
    const { data } = await client.from('public_profiles').select('id, display_name').in('id', userIds)
    const map: Record<string, string> = {}
    for (const p of (data ?? []) as PublicProfile[]) map[p.id] = p.display_name
    return map
  })
}

export function fetchCommunityStats(): Promise<{
  cityStats: CityCostStat[]
  modelStats: ModelTripStat[]
  error: string | null
}> {
  const client = supabase
  if (!client) return Promise.resolve({ cityStats: [], modelStats: [], error: null })
  return cached(
    'communityStats',
    async () => {
      const [cityRes, modelRes] = await Promise.all([
        client.from('service_cost_stats_by_city').select('*'),
        client.from('trip_stats_by_model').select('*'),
      ])
      return {
        cityStats: (cityRes.data ?? []) as CityCostStat[],
        modelStats: (modelRes.data ?? []) as ModelTripStat[],
        error: cityRes.error
          ? toFriendlyError(cityRes.error)
          : modelRes.error
            ? toFriendlyError(modelRes.error)
            : null,
      }
    },
    (r) => r.error !== null
  )
}

// Renders the per-city average service cost as StatGrid items, shared by
// Costos, Mantenimiento, and the Comunidad feed so the wording stays in sync.
export function cityCostStatItems(cityStats: CityCostStat[]): StatItem[] {
  return cityStats.map((s) => ({
    value: formatCurrency(s.avg_cost_uyu),
    label: `Costo medio de service en ${s.city} (${s.entry_count})`,
  }))
}

// The fetch-into-state effect that goes with cityCostStatItems, for pages
// that only need the city stats (the feed also needs modelStats and keeps
// its own effect).
export function useCityCostStats(): CityCostStat[] {
  const [cityStats, setCityStats] = useState<CityCostStat[]>([])
  useEffect(() => {
    if (!supabase) return
    void fetchCommunityStats().then(({ cityStats: cs }) => setCityStats(cs))
  }, [])
  return cityStats
}

// Minimum community purchases per category before showing an average price.
const MIN_PURCHASE_PRICE_SAMPLES = 2

export interface PurchaseSection {
  priceStats: StatItem[]
  recentPurchases: PartPurchase[]
}

// Shared by PartsPage/AccessoriesPage: both filter the same part_purchases
// table down to their own category slice (via isPartCategory/
// isAccessoryCategory), then derive the same price-stat and
// recent-purchases lists from it.
export function usePurchaseSection(
  allPurchases: PartPurchase[],
  isInScope: (category: string) => boolean
): PurchaseSection {
  const purchases = useMemo(() => allPurchases.filter((p) => isInScope(p.category)), [allPurchases, isInScope])

  const priceStats = useMemo(() => {
    const byCategory = new Map<string, number[]>()
    for (const p of purchases) {
      const list = byCategory.get(p.category) ?? []
      list.push(p.price_uyu)
      byCategory.set(p.category, list)
    }
    return [...byCategory.entries()]
      .filter(([, prices]) => prices.length >= MIN_PURCHASE_PRICE_SAMPLES)
      .map(([category, prices]) => ({
        value: formatCurrency(prices.reduce((a, b) => a + b, 0) / prices.length),
        label: `Precio medio · ${purchaseCategoryTitle(category)} (${prices.length})`,
      }))
  }, [purchases])

  const recentPurchases = useMemo(() => verifiedFirst(purchases).slice(0, 15), [purchases])

  return { priceStats, recentPurchases }
}

export function fetchLeaderboard(): Promise<{ rows: VehicleLeaderboardEntry[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ rows: [], error: null })
  return cached(
    'leaderboard',
    async () => {
      const { data, error } = await client.from('vehicle_km_leaderboard').select('*')
      return { rows: (data ?? []) as VehicleLeaderboardEntry[], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

export function fetchCommunityTotals(): Promise<{ totals: CommunityTotals | null; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ totals: null, error: null })
  return cached(
    'communityTotals',
    async () => {
      const { data, error } = await client.from('community_totals').select('*').single()
      return { totals: (data as CommunityTotals) ?? null, error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

// ── Charging stations (D4) ────────────────────────────────────────────────

// Providers with their per-network usage instructions (0024). Sorted by
// sort_order: Uruguay first, then AR/BR, 'otro' last.
export function fetchChargingNetworks(): Promise<{ networks: ChargingNetwork[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ networks: [], error: null })
  return cached(
    'chargingNetworks',
    async () => {
      const { data, error } = await client
        .from('charging_networks')
        .select('*')
        .order('sort_order')
        .order('name')
      return { networks: (data ?? []) as ChargingNetwork[], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

export function fetchChargingStations(): Promise<{ stations: ChargingStation[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ stations: [], error: null })
  return cached(
    'chargingStations',
    async () => {
      const { data, error } = await client
        .from('charging_stations')
        .select('*')
        .order('network')
        .order('name')
      return { stations: (data ?? []) as ChargingStation[], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

export function fetchChargingCostStats(): Promise<{ stats: ChargingCostStat[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ stats: [], error: null })
  return cached(
    'chargingCostStats',
    async () => {
      const { data, error } = await client.from('charging_cost_stats').select('*')
      return { stats: (data ?? []) as ChargingCostStat[], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

export function fetchStationReliability(): Promise<{ rows: StationReliability[]; error: string | null }> {
  const client = supabase
  if (!client) return Promise.resolve({ rows: [], error: null })
  return cached(
    'stationReliability',
    async () => {
      const { data, error } = await client.from('station_reliability').select('*')
      return { rows: (data ?? []) as StationReliability[], error: error ? toFriendlyError(error) : null }
    },
    (r) => r.error !== null
  )
}

// Prices only render at this many real charges; below it the curated text
// stays (see specs/CONTENT-MIGRATION.md).
export const MIN_COST_SAMPLES = 3

// Station-level average preferred; per-network rollup (station_id null) as
// fallback; null when neither reaches the sample floor.
export function pickCostStat(
  stats: ChargingCostStat[],
  network: string,
  stationId: string
): ChargingCostStat | null {
  const station = stats.find((s) => s.station_id === stationId && s.sample_count >= MIN_COST_SAMPLES)
  if (station) return station
  return (
    stats.find((s) => s.network === network && s.station_id === null && s.sample_count >= MIN_COST_SAMPLES) ??
    null
  )
}

export type ReliabilityLevel = 'ok' | 'flaky' | 'unknown'

// >30% failures over >=3 reports in the last 90 days reads as flaky.
export function reliabilityLevel(rel: StationReliability | undefined): ReliabilityLevel {
  if (!rel || rel.report_count < 3) return 'unknown'
  return rel.failure_ratio > 0.3 ? 'flaky' : 'ok'
}

// ── Reactions & comments (D5, community content only) ────────────────────
// content_reactions/content_comments (migration 0027) each target exactly
// one of three nullable FK columns; this maps the app-facing `ReactableContent`
// kind to that column name everywhere a raw Supabase call needs it.

type ReactableKind = ReactableContent['kind']

const REACTION_COLUMN: Record<ReactableKind, 'service_entry_id' | 'trip_log_id' | 'part_purchase_id'> = {
  service_entry: 'service_entry_id',
  trip_log: 'trip_log_id',
  part_purchase: 'part_purchase_id',
}

// All three FK columns always present (two undefined) so the return type is
// one exact shape instead of a union of differently-keyed objects -- Supabase's
// insert() typing rejects a union whose members don't all carry the same keys.
function reactionRow(kind: ReactableKind, contentId: string, userId: string) {
  return {
    service_entry_id: kind === 'service_entry' ? contentId : undefined,
    trip_log_id: kind === 'trip_log' ? contentId : undefined,
    part_purchase_id: kind === 'part_purchase' ? contentId : undefined,
    user_id: userId,
  }
}

function commentRow(kind: ReactableKind, contentId: string, userId: string, body: string) {
  return { ...reactionRow(kind, contentId, userId), body }
}

export interface ReactionState {
  counts: Record<string, number>
  likedByMe: Set<string>
}

// One round trip for a whole page's worth of content ids: fetches the raw
// rows (not the content_reaction_counts view) so the count and "did I like
// this" set come from the same query instead of two.
export function fetchReactions(
  kind: ReactableKind,
  ids: string[],
  userId: string | null
): Promise<ReactionState> {
  const client = supabase
  if (!client || ids.length === 0) return Promise.resolve({ counts: {}, likedByMe: new Set() })
  const column = REACTION_COLUMN[kind]
  return cached(`reactions:${kind}:${[...ids].sort().join(',')}`, async () => {
    const { data } = await client.from('content_reactions').select('*').in(column, ids)
    const counts: Record<string, number> = {}
    const likedByMe = new Set<string>()
    for (const row of (data ?? []) as ContentReaction[]) {
      const id = row[column]
      if (!id) continue
      counts[id] = (counts[id] ?? 0) + 1
      if (userId && row.user_id === userId) likedByMe.add(id)
    }
    return { counts, likedByMe }
  })
}

export function fetchComments(kind: ReactableKind, ids: string[]): Promise<ContentComment[]> {
  const client = supabase
  if (!client || ids.length === 0) return Promise.resolve([])
  const column = REACTION_COLUMN[kind]
  return cached(`comments:${kind}:${[...ids].sort().join(',')}`, async () => {
    const { data } = await client
      .from('content_comments')
      .select('*')
      .in(column, ids)
      .order('created_at', { ascending: true })
    return data ?? []
  })
}

// Toggle: insert to like, delete the (unique) row to unlike.
export async function toggleReaction(
  kind: ReactableKind,
  contentId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const column = REACTION_COLUMN[kind]
  const { error } = currentlyLiked
    ? await client.from('content_reactions').delete().eq(column, contentId).eq('user_id', userId)
    : await client.from('content_reactions').insert(reactionRow(kind, contentId, userId))
  invalidateCommunityCache()
  return { error: error ? toFriendlyError(error) : null }
}

export async function postComment(
  kind: ReactableKind,
  contentId: string,
  userId: string,
  body: string
): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const { error } = await client.from('content_comments').insert(commentRow(kind, contentId, userId, body))
  invalidateCommunityCache()
  return { error: error ? toFriendlyError(error) : null }
}

// Own comment or moderator (enforced by RLS); id is the comment's own uuid.
export async function deleteComment(id: string): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const { error } = await client.from('content_comments').delete().eq('id', id)
  invalidateCommunityCache()
  return { error: error ? toFriendlyError(error) : null }
}

// ── Site search (0028) ───────────────────────────────────────────────────
// Deliberately not run through `cached()`: each call is keyed by a
// free-typed query string with low reuse, so memoizing it would just grow
// the TTL cache with one-off entries instead of saving round trips.

export async function searchCommunityContent(
  query: string,
  limit = 20
): Promise<{ results: CommunitySearchResult[]; error: string | null }> {
  const client = supabase
  if (!client || query.trim() === '') return { results: [], error: null }
  const { data, error } = await client.rpc('search_community_content', {
    search_query: query,
    result_limit: limit,
  })
  return {
    results: (data ?? []) as CommunitySearchResult[],
    error: error ? toFriendlyError(error) : null,
  }
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

    void load()
    return () => {
      cancelled = true
    }
  }, [wantTrips, wantEntries, wantPurchases, limit])

  return { trips, entries, purchases, names, loading, error }
}
