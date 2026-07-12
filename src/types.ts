// Shared primitive types

export type Model = 'E2' | 'E2+'
export type Color = 'Blanco' | 'Verde' | 'Gris' | 'Beige' | 'Negro'

export interface TipItem {
  bold?: string
  text: string
}

export interface StatItem {
  value: string
  label: string
  model?: Model | null
}

// ── Charging data ────────────────────────────────────────────────────────────

export type AutonomyStandard = 'CLTC' | 'NEDC' | 'WLTP'

export interface AutonomyEntry {
  km: number
  note: string
}

export interface AutonomyData {
  standards: AutonomyStandard[]
  models: Record<Model, Record<AutonomyStandard, AutonomyEntry>>
  realConsumption: StatItem[]
  disclaimer: string
}

export type SourceTag = 'manual' | 'comunidad'

export interface Charger {
  name: string
  badge: string
  badgeColor: string
  details: string
  tips?: string
  source?: SourceTag
}

export interface PublicChargingData {
  alert: string
  chargers: Charger[]
  alerts: string[]
}

export interface HomeChargingData {
  title: string
  tips: TipItem[]
}

export interface ChargingData {
  stats: StatItem[]
  autonomy: AutonomyData
  homeCharging: HomeChargingData
  publicCharging: PublicChargingData
  v2l: HomeChargingData
  troubleshooting: HomeChargingData
}

// ── Routes data ──────────────────────────────────────────────────────────────

export type StopType = 'origin' | 'destination' | 'charge' | 'warning'

export interface Stop {
  type: StopType
  name: string
  note?: string
}

export interface Route {
  id: string
  title: string
  distance: string
  difficulty: string
  stops: Stop[]
  tips?: string[]
}

export interface RoutesData {
  generalTips: TipItem[]
  routes: Route[]
}

// ── Costs data ───────────────────────────────────────────────────────────────

export interface PerKmRow {
  label: string
  value: string
  badge?: string
  badgeColor?: string
}

export interface ChargeOption {
  label: string
  total: number
  note: string
  base: number
  energy: number
}

export interface ModelFullCharge {
  battery: number
  options: ChargeOption[]
}

export interface RealCase {
  title: string
  km: number
  period: string
  cost: string
  costPerKm: string
  conditions: string
  comparison: string
}

export interface PatentEntry {
  valuation: string
  patent: string
}

export interface PatentData {
  e2: PatentEntry
  e2plus: PatentEntry
  note: string
  policyNotes: string[]
}

export interface InsuranceData {
  range: string
  disclaimer: string
  insurers: string[]
}

export interface CostsData {
  perKm: PerKmRow[]
  fullCharge: Record<Model, ModelFullCharge>
  realCases: RealCase[]
  patent: PatentData
  insurance: InsuranceData
}

// ── Parts catalog data ───────────────────────────────────────────────────────

export interface PartCategory {
  id: string
  icon: string
  title: string
  spec?: string
  tips?: TipItem[]
}

export interface PartsData {
  intro: string
  categories: PartCategory[]
}

// ── Accessories data ─────────────────────────────────────────────────────────

export interface Category {
  id: string
  icon: string
  title: string
  items: TipItem[]
}

export interface AccessoriesData {
  categories: Category[]
}

// ── Tech / FAQ data ──────────────────────────────────────────────────────────

export interface TechSection {
  id: string
  icon: string
  title: string
  items: TipItem[]
}

export interface FaqEntry {
  id: string
  icon: string
  q: string
  a: string
}

export interface TechFaqData {
  tech: TechSection[]
  faq: FaqEntry[]
}

// ── Ficha técnica data ───────────────────────────────────────────────────────

export interface SpecRow {
  label: string
  value: string
  model?: Model | null
}

export interface SpecGroup {
  id: string
  icon: string
  title: string
  rows: SpecRow[]
  note?: string
}

export type LightSeverity = 'danger' | 'warning' | 'info'

export interface WarningLight {
  icon: string
  name: string
  meaning: string
  severity: LightSeverity
}

export interface VinLocation {
  label: string
  text: string
}

export interface FichaTecnicaData {
  specGroups: SpecGroup[]
  warningLights: WarningLight[]
  vinLocations: VinLocation[]
  warranty: TipItem[]
}

// ── Mantenimiento data ───────────────────────────────────────────────────────

export interface ScheduleItem {
  interval: string
  tasks: string[]
}

export interface DealerPriceRow {
  dealer: string
  service: string
  price: string
  note?: string
}

export interface MantenimientoData {
  officialNote: string
  schedule: ScheduleItem[]
  severeConditions: TipItem[]
  dealerPrices: DealerPriceRow[]
  knownIssues: Category[]
  safety: TipItem[]
  warrantyNote: string
}

// ── Supabase-backed shapes (derived from generated DB types) ────────────────
// The base shapes come from src/lib/database.types.ts (regenerate with
// `npm run gen:types` after every migration) so schema drift becomes a
// compile error. Hand-written overrides exist only where we know more than
// the codegen:
//  - `model`/`color` are narrowed from `string` to their union types;
//  - `charging_stops` is jsonb, narrowed to TripChargingStop[] (the cast at
//    the fetch boundary is the only place that shape is asserted);
//  - view columns are all `| null` in codegen (Postgres can't prove view
//    nullability) but several are coalesced/aggregated and never null in
//    practice — NonNullableRow re-tightens those.

import type { Database } from './lib/database.types'

type Tables = Database['public']['Tables']
type Views = Database['public']['Views']

type NonNullableRow<T> = { [K in keyof T]-?: NonNullable<T[K]> }

// ── Auth profile ─────────────────────────────────────────────────────────────

export type Profile = Omit<Tables['profiles']['Row'], 'model' | 'color'> & {
  model: Model | null
  color: Color | null
}

// Minimal author info exposed to everyone (incl. anonymous visitors) through
// the public_profiles view — never the full profiles table. Both columns come
// from NOT NULL profile columns, so the view's codegen nulls are spurious.
export type PublicProfile = NonNullableRow<Views['public_profiles']['Row']>

// ── User-submitted content ───────────────────────────────────────────────────

export type ServiceEntry = Tables['service_entries']['Row']

export type PartPurchase = Tables['part_purchases']['Row']

// Shape of one element of trip_logs.charging_stops (jsonb — no generated
// shape; this is the one hand-maintained DB shape left).
export type TripChargingStop = {
  name: string
  note?: string
  distance_from_previous_km?: number
  arrival_percentage?: number
  departure_percentage?: number
  duration_minutes?: number
  average_speed_kmh?: number
}

export type TripLog = Omit<Tables['trip_logs']['Row'], 'model' | 'charging_stops'> & {
  model: Model | null
  charging_stops: TripChargingStop[]
}

// ── Vehicles (shared cars) ───────────────────────────────────────────────────

// Vehicles have no public name: the leaderboard labels them by their
// members' display names. `plate` is optional and, like join_code, only
// visible to the vehicle's own members (members-only RLS).
export type Vehicle = Omit<Tables['vehicles']['Row'], 'model'> & {
  model: Model | null
}

// Row shape of the vehicle_km_leaderboard view (public; never join_code/plate).
// Every column is grouped/coalesced — never null despite the view codegen.
export type VehicleLeaderboardEntry = NonNullableRow<Views['vehicle_km_leaderboard']['Row']>

// ── Community aggregates (Supabase views) ────────────────────────────────────

// city is filtered non-null in the view; the aggregates never are.
export type CityCostStat = NonNullableRow<Views['service_cost_stats_by_city']['Row']>

// model is filtered non-null and trip_count is count(*), but the medians are
// genuinely nullable (a group whose trips all lack distance/speed).
export type ModelTripStat = NonNullableRow<
  Pick<Views['trip_stats_by_model']['Row'], 'model' | 'trip_count'>
> &
  Pick<Views['trip_stats_by_model']['Row'], 'avg_distance_km' | 'avg_speed_kmh'>

export type CommunityTotals = NonNullableRow<Views['community_totals']['Row']>

// ── Moderation (admin_list_users RPC) ───────────────────────────────────────

// Function return types carry no nullability in codegen, so re-widen the
// columns that really can be null, and narrow `model` to its union.
export type AdminUserRow = Omit<
  Database['public']['Functions']['admin_list_users']['Returns'][number],
  'banned_at' | 'city' | 'model'
> & {
  banned_at: string | null
  city: string | null
  model: Model | null
}
