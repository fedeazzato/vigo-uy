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
  disclaimer: string
}

export interface Charger {
  name: string
  badge: string
  badgeColor: string
  details: string
  tips?: string
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
}

export interface CostsData {
  perKm: PerKmRow[]
  fullCharge: Record<Model, ModelFullCharge>
  realCases: RealCase[]
  patent: PatentData
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
  q: string
  a: string
}

export interface TechFaqData {
  tech: TechSection[]
  faq: FaqEntry[]
}
