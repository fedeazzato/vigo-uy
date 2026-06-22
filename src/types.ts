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
