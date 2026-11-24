// Client of the `ocm-stations` Edge Function (specs/ocm-proxy.md R3):
// Open Charge Map stations for the visible map area, through WikiVigo's
// shared tile cache. The request box is snapped to the same 0.5-degree grid
// the function caches by, so the URL stays the same while panning inside
// the same tiles (the browser's HTTP cache answers those) and no precise
// position is ever sent.
import { haversineKm } from './geo'

export const OCM_TILE_DEG = 0.5
export const OCM_MAX_TILES = 20
/** An OCM station this close to a WikiVigo station shown on the map is the same place. */
export const OCM_DEDUP_KM = 0.05
export const OCM_DEBOUNCE_MS = 600
export const OCM_MAX_RETRIES = 3
export const OCM_HOME = 'https://openchargemap.org/'

export type OcmConnectorType =
  'ccs2' | 'type2' | 'type2_socket' | 'ccs1' | 'chademo' | 'type1' | 'gbt' | 'tesla' | 'schuko' | 'other'

export type OcmStatus =
  | 'available'
  | 'operational'
  | 'in_use'
  | 'partly'
  | 'temp_unavailable'
  | 'out_of_service'
  | 'planned'
  | 'removed'
  | 'unknown'

export interface OcmConnector {
  type: OcmConnectorType
  type_id: number | null
  kw: number | null
  qty: number
  current: 'AC' | 'DC' | null
}

export interface OcmStation {
  id: number
  name: string
  operator: string | null
  lat: number
  lng: number
  address: string | null
  town: string | null
  country: string | null
  status: OcmStatus
  restricted: boolean
  usage_cost: string | null
  verified_at: string | null
  connectors: OcmConnector[]
  max_kw: number | null
}

export interface OcmAnswer {
  stations: OcmStation[]
  complete: boolean
  retryAfter: number | null
  attribution: string
}

/** Server-side filters (OCM connection type ids, minimum kW); {} = everything the function fetches. */
export interface OcmFilter {
  connectiontypeid?: number[]
  minKw?: number
}

export interface ViewBounds {
  south: number
  west: number
  north: number
  east: number
}

export const CONNECTOR_LABEL: Record<OcmConnectorType, string> = {
  ccs2: 'CCS2',
  type2: 'Tipo 2',
  type2_socket: 'Tipo 2 sin cable',
  ccs1: 'CCS1',
  chademo: 'CHAdeMO',
  type1: 'Tipo 1',
  gbt: 'GB/T',
  tesla: 'Tesla',
  schuko: 'Schuko',
  other: 'Otro',
}

export const STATUS_LABEL: Record<OcmStatus, string> = {
  available: 'Disponible',
  operational: 'Operativa',
  in_use: 'En uso',
  partly: 'Parcialmente operativa',
  temp_unavailable: 'No disponible temporalmente',
  out_of_service: 'Fuera de servicio',
  planned: 'Planificada',
  removed: 'Retirada',
  unknown: 'Estado desconocido',
}

/** The function's base URL, or null when Supabase is not configured (the OCM layer then stays off). */
export function ocmFunctionBase(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

/**
 * The WikiVigo toolbar filters as OCM filters: connector CCS2 -> 33, Tipo 2 -> 1036 (tethered), Sin cable -> 25 (socket only), none
 * -> all; minimum power -> minKw. null for a connector the function does not fetch (Tipo 1, CCS1, GB/T): no OCM layer then.
 */
export function ocmFilterFor(connector: string, minPower: string): OcmFilter | null {
  const filter: OcmFilter = {}
  if (connector === 'CCS2') filter.connectiontypeid = [33]
  else if (connector === 'Tipo 2') filter.connectiontypeid = [1036]
  else if (connector === 'Sin cable') filter.connectiontypeid = [25]
  else if (connector !== '') return null
  const kw = Number(minPower)
  if (minPower !== '' && Number.isFinite(kw) && kw > 0) filter.minKw = kw
  return filter
}

export type OcmRequest = { kind: 'ok'; url: string } | { kind: 'too_large' } | { kind: 'unsupported' }

/**
 * The request for a map view: the view widened to whole tiles. too_large above OCM_MAX_TILES; unsupported for a view that wraps
 * around the antimeridian (Leaflet longitudes beyond +-180).
 */
export function ocmRequest(base: string, view: ViewBounds, filter: OcmFilter): OcmRequest {
  if (!(view.west >= -180 && view.east <= 180 && view.west < view.east)) return { kind: 'unsupported' }
  const snapDown = (v: number) => Math.floor(v / OCM_TILE_DEG) * OCM_TILE_DEG
  const snapUp = (v: number) => Math.ceil(v / OCM_TILE_DEG) * OCM_TILE_DEG
  const south = Math.max(-90, snapDown(view.south))
  let north = Math.min(90, snapUp(view.north))
  const west = Math.max(-180, snapDown(view.west))
  let east = Math.min(180, snapUp(view.east))
  if (north <= south) north = south + OCM_TILE_DEG
  if (east <= west) east = west + OCM_TILE_DEG
  const tiles = Math.round((north - south) / OCM_TILE_DEG) * Math.round((east - west) / OCM_TILE_DEG)
  if (tiles > OCM_MAX_TILES) return { kind: 'too_large' }
  const params = new URLSearchParams({ bbox: [south, west, north, east].join(',') })
  if (filter.connectiontypeid?.length) params.set('connectiontypeid', filter.connectiontypeid.join(','))
  if (filter.minKw !== undefined) params.set('min_kw', String(filter.minKw))
  return { kind: 'ok', url: `${base}/functions/v1/ocm-stations?${params.toString()}` }
}

export type OcmFetchResult = { ok: true; answer: OcmAnswer } | { ok: false; message: string }

const MESSAGES: Record<string, string> = {
  rate_limited: 'Demasiadas consultas a Open Charge Map. Probá de nuevo en unos minutos.',
  not_configured: 'Las estaciones de Open Charge Map todavía no están disponibles.',
  upstream: 'Open Charge Map no respondió. Probá de nuevo más tarde.',
  area_too_large: 'Acercá el mapa para ver también estaciones de Open Charge Map.',
}
const GENERIC = 'No se pudieron cargar las estaciones de Open Charge Map.'

function isStation(v: unknown): v is OcmStation {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    Number.isInteger(s.id) &&
    typeof s.name === 'string' &&
    typeof s.lat === 'number' &&
    typeof s.lng === 'number' &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    Array.isArray(s.connectors)
  )
}

/** GET without custom headers (a simple CORS request: no preflight). null when aborted. */
export async function fetchOcmStations(url: string, signal?: AbortSignal): Promise<OcmFetchResult | null> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) return null
    return {
      ok: false,
      message: 'No pudimos conectar con Open Charge Map. Revisá tu internet y probá de nuevo.',
    }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    if (signal?.aborted) return null
    return { ok: false, message: GENERIC }
  }
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (!res.ok || o.ok !== true || !Array.isArray(o.stations)) {
    const code = typeof o.error === 'string' ? o.error : ''
    return { ok: false, message: MESSAGES[code] ?? GENERIC }
  }
  return {
    ok: true,
    answer: {
      stations: o.stations.filter(isStation),
      complete: o.complete === true,
      retryAfter: typeof o.retry_after === 'number' && o.retry_after > 0 ? o.retry_after : null,
      attribution: typeof o.attribution === 'string' ? o.attribution : 'Datos de Open Charge Map (CC BY 4.0)',
    },
  }
}

/** Shown on the map: not removed or only planned, and not within 50 m of a WikiVigo station on the same map. */
export function visibleOcmStations(ocm: OcmStation[], wiki: { lat: number; lng: number }[]): OcmStation[] {
  return ocm.filter(
    (s) =>
      s.status !== 'removed' &&
      s.status !== 'planned' &&
      !wiki.some((w) => haversineKm({ lat: s.lat, lng: s.lng }, w) < OCM_DEDUP_KM)
  )
}

/** Built from the numeric id (never from a URL in the data). */
export function ocmDetailsUrl(id: number): string {
  return `https://openchargemap.org/site/poi/details/${id}`
}

function kwText(kw: number): string {
  return `${kw.toLocaleString('es-UY', { maximumFractionDigits: 1 })} kW`
}

/** "CCS2 ×2 (120 kW), Tipo 2 (22,2 kW)". */
export function connectorsText(connectors: OcmConnector[]): string {
  return connectors
    .map((c) => {
      const qty = c.qty > 1 ? ` ×${c.qty}` : ''
      const kw = c.kw !== null && c.kw > 0 ? ` (${kwText(c.kw)})` : ''
      return `${CONNECTOR_LABEL[c.type] ?? CONNECTOR_LABEL.other}${qty}${kw}`
    })
    .join(', ')
}

/** "12 nov 2026" style date of the last OCM verification, or null. */
export function verifiedText(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The attribution as safe HTML for Leaflet's attribution control (OCM provider titles are data, never markup). */
export function attributionHtml(text: string): string {
  const esc = text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
  return `<a href="${OCM_HOME}" target="_blank" rel="noopener noreferrer">${esc}</a>`
}
