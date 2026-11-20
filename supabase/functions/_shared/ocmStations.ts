// Open Charge Map proxy, wire protocol v1 (specs/ocm-proxy.md R1): request
// parsing, the 0.5-degree tile grid, the OCM POI normaliser and the request
// handler of the `ocm-stations` Edge Function.
//
// Pure TypeScript, no imports: the Deno entry point (../ocm-stations/index.ts)
// injects the database access (service-role RPCs of migration 0047), fetch,
// the clock and the secrets, and Vitest tests this module directly under Node.
//
// The OCM key travels only in the X-API-Key header of the upstream request:
// it is never put in a URL, a response or a log line.

export const TILE_DEG = 0.5
export const TILE_PREFIX = 'v1'
export const MAX_TILES = 20
export const MAX_RADIUS_KM = 60
/** OCM ConnectionTypeIDs fetched for every tile: CCS (Type 2), Type 2 socket only, Type 2 tethered (the Vigo's sockets). */
export const FETCH_CONNECTION_TYPES: readonly number[] = [33, 25, 1036]
export const OCM_ENDPOINT = 'https://api.openchargemap.io/v3/poi/'
export const OCM_MAX_RESULTS = 1000
export const OCM_USER_AGENT = 'WikiVigo/1 (ocm-stations)'
export const OCM_ATTRIBUTION = 'Datos de Open Charge Map (CC BY 4.0)'
export const OCM_DETAILS_URL = 'https://openchargemap.org/site/poi/details/'
export const MAX_RESPONSE_STATIONS = 2000
export const FETCH_CONCURRENCY = 3
export const FETCH_TIMEOUT_MS = 10_000
export const MAX_UPSTREAM_BYTES = 20 * 1024 * 1024
export const RETRY_AFTER_S = 5
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://fedeazzato.github.io',
  'http://localhost:5173',
]

const KM_PER_DEG_LAT = 111.32
const COORD = /^-?\d{1,3}(?:\.\d{1,10})?$/
const POSITIVE = /^\d{1,4}(?:\.\d{1,6})?$/

// ---------------------------------------------------------------- tiles

export interface Area {
  south: number
  west: number
  north: number
  east: number
}

export interface Tile {
  i: number
  j: number
  key: string
}

export function tileKey(i: number, j: number): string {
  return `${TILE_PREFIX}:${i}:${j}`
}

/** The tile containing a point. */
export function tileOf(lat: number, lng: number): Tile {
  const i = Math.min(179, Math.max(-180, Math.floor(lat / TILE_DEG)))
  const j = Math.min(359, Math.max(-360, Math.floor(lng / TILE_DEG)))
  return { i, j, key: tileKey(i, j) }
}

export function tileArea(t: Pick<Tile, 'i' | 'j'>): Area {
  return {
    south: t.i * TILE_DEG,
    north: (t.i + 1) * TILE_DEG,
    west: t.j * TILE_DEG,
    east: (t.j + 1) * TILE_DEG,
  }
}

/** Tile index range covering an area (an edge exactly on a grid line does not pull in the next tile). */
export function tileRange(a: Area): {
  iMin: number
  iMax: number
  jMin: number
  jMax: number
  count: number
} {
  const iMin = Math.max(-180, Math.floor(a.south / TILE_DEG))
  const iMax = Math.min(179, Math.max(iMin, Math.ceil(a.north / TILE_DEG) - 1))
  const jMin = Math.max(-360, Math.floor(a.west / TILE_DEG))
  const jMax = Math.min(359, Math.max(jMin, Math.ceil(a.east / TILE_DEG) - 1))
  return { iMin, iMax, jMin, jMax, count: (iMax - iMin + 1) * (jMax - jMin + 1) }
}

/** Tiles of an area, nearest to its centre first (ties: south to north, west to east). */
export function tilesFor(a: Area): Tile[] {
  const r = tileRange(a)
  const ci = (a.south + a.north) / 2 / TILE_DEG - 0.5
  const cj = (a.west + a.east) / 2 / TILE_DEG - 0.5
  const out: Tile[] = []
  for (let i = r.iMin; i <= r.iMax; i++)
    for (let j = r.jMin; j <= r.jMax; j++) out.push({ i, j, key: tileKey(i, j) })
  const d = (t: Tile) => (t.i - ci) ** 2 + (t.j - cj) ** 2
  return out.sort((x, y) => d(x) - d(y) || x.i - y.i || x.j - y.j)
}

/** The tile-aligned box of a tile set. */
export function coveredArea(tiles: Tile[]): Area {
  const is = tiles.map((t) => t.i)
  const js = tiles.map((t) => t.j)
  return {
    south: Math.min(...is) * TILE_DEG,
    north: (Math.max(...is) + 1) * TILE_DEG,
    west: Math.min(...js) * TILE_DEG,
    east: (Math.max(...js) + 1) * TILE_DEG,
  }
}

/** A circle of radiusKm around a point, as a box (clamped to the map, no antimeridian wrap). */
export function radiusArea(lat: number, lng: number, radiusKm: number): Area {
  const dLat = radiusKm / KM_PER_DEG_LAT
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01)
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos)
  return {
    south: Math.max(-90, lat - dLat),
    north: Math.min(90, lat + dLat),
    west: Math.max(-180, lng - dLng),
    east: Math.min(180, lng + dLng),
  }
}

// ---------------------------------------------------------------- request parsing

export interface StationFilter {
  types: number[] | null
  minKw: number | null
}

export interface ParsedQuery {
  area: Area
  tiles: Tile[]
  filter: StationFilter
}

export type QueryError = 'bad_request' | 'area_too_large'

function coord(v: string | null, min: number, max: number): number | null {
  if (v === null || !COORD.test(v.trim())) return null
  const n = Number(v.trim())
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function parseQuery(params: URLSearchParams): ParsedQuery | { error: QueryError } {
  const bad = { error: 'bad_request' as const }
  const bbox = params.get('bbox')
  const hasPoint = params.has('lat') || params.has('lng') || params.has('radius_km')
  let area: Area
  if (bbox !== null) {
    if (hasPoint) return bad
    const parts = bbox.split(',')
    if (parts.length !== 4) return bad
    const [south, west, north, east] = [
      coord(parts[0], -90, 90),
      coord(parts[1], -180, 180),
      coord(parts[2], -90, 90),
      coord(parts[3], -180, 180),
    ]
    if (south === null || west === null || north === null || east === null) return bad
    if (!(south < north) || !(west < east)) return bad
    area = { south, west, north, east }
  } else {
    const lat = coord(params.get('lat'), -90, 90)
    const lng = coord(params.get('lng'), -180, 180)
    const r = params.get('radius_km')
    if (lat === null || lng === null || r === null || !POSITIVE.test(r.trim())) return bad
    const radius = Number(r.trim())
    if (!(radius > 0) || radius > MAX_RADIUS_KM) return bad
    area = radiusArea(lat, lng, radius)
  }

  let types: number[] | null = null
  const ct = params.get('connectiontypeid')
  if (ct !== null) {
    const ids = ct.split(',').map((s) => s.trim())
    if (ids.length === 0 || ids.some((s) => !/^\d{1,5}$/.test(s))) return bad
    types = [...new Set(ids.map(Number))]
    if (types.some((t) => !FETCH_CONNECTION_TYPES.includes(t))) return bad
  }
  let minKw: number | null = null
  const mk = params.get('min_kw')
  if (mk !== null) {
    if (!POSITIVE.test(mk.trim())) return bad
    minKw = Number(mk.trim())
    if (!(minKw >= 0 && minKw <= 1000)) return bad
  }

  if (tileRange(area).count > MAX_TILES) return { error: 'area_too_large' }
  return { area, tiles: tilesFor(area), filter: { types, minKw } }
}

// ---------------------------------------------------------------- OCM data

export type StationStatus =
  | 'available'
  | 'operational'
  | 'in_use'
  | 'partly'
  | 'temp_unavailable'
  | 'out_of_service'
  | 'planned'
  | 'removed'
  | 'unknown'

/** Best first: a POI without its own status takes its best connector status. */
const STATUS_RANK: StationStatus[] = [
  'available',
  'operational',
  'in_use',
  'partly',
  'temp_unavailable',
  'out_of_service',
  'planned',
  'removed',
  'unknown',
]

export type ConnectorType =
  'ccs2' | 'type2' | 'type2_socket' | 'ccs1' | 'chademo' | 'type1' | 'gbt' | 'tesla' | 'schuko' | 'other'

export interface OcmConnector {
  type: ConnectorType
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
  status: StationStatus
  restricted: boolean
  usage_cost: string | null
  verified_at: string | null
  connectors: OcmConnector[]
  max_kw: number | null
  provider_id: number | null
}

export interface OcmProvider {
  title: string
  license: string | null
}

/** What a tile stores in ocm_tile_cache.payload. */
export interface TilePayload {
  v: 1
  stations: OcmStation[]
  providers: Record<string, OcmProvider>
}

type Obj = Record<string, unknown>

function obj(v: unknown): Obj | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN
}

/** Trimmed text without control characters, capped; null when empty or not a string. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = Array.from(v)
    .map((ch) => {
      const c = ch.charCodeAt(0)
      return c < 32 || c === 127 ? ' ' : ch
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max).trimEnd() : t
}

function idOf(o: Obj | null, idField: string, objField: string): number {
  if (!o) return -1
  const direct = num(o[idField])
  if (Number.isInteger(direct)) return direct
  const nested = num(obj(o[objField])?.ID)
  return Number.isInteger(nested) ? nested : -1
}

export function statusOf(id: number): StationStatus {
  switch (id) {
    case 10:
      return 'available'
    case 50:
      return 'operational'
    case 20:
      return 'in_use'
    case 75:
      return 'partly'
    case 30:
      return 'temp_unavailable'
    case 100:
      return 'out_of_service'
    case 150:
      return 'planned'
    case 200:
    case 210:
      return 'removed'
    default:
      return 'unknown'
  }
}

/** Same mapping as the car app (vigo-hack chargers core/Ocm.plug). */
export function connectorTypeOf(id: number, title: string | null): ConnectorType {
  switch (id) {
    case 33:
      return 'ccs2'
    case 25:
      return 'type2_socket'
    case 1036:
      return 'type2'
    case 32:
      return 'ccs1'
    case 2:
      return 'chademo'
    case 1:
      return 'type1'
    case 27:
    case 30:
      return 'tesla'
    case 28:
      return 'schuko'
  }
  const t = (title ?? '').toLowerCase()
  if (t.includes('ccs') && t.includes('type 2')) return 'ccs2'
  if (t.includes('ccs') && t.includes('type 1')) return 'ccs1'
  if (t.includes('type 2') && t.includes('tethered')) return 'type2'
  if (t.includes('type 2')) return 'type2_socket'
  if (t.includes('chademo')) return 'chademo'
  if (t.includes('gb-t') || t.includes('gb/t')) return 'gbt'
  if (t.includes('type 1') || t.includes('j1772')) return 'type1'
  if (t.includes('tesla')) return 'tesla'
  if (t.includes('schuko')) return 'schuko'
  return 'other'
}

/**
 * kW of a connection: PowerKW when given, else amps x volts (CurrentTypeID 20 = AC three-phase: a line voltage of 380 V or more
 * gives sqrt(3) x V x A, a phase voltage gives 3 x V x A; 10 = AC single-phase and 30 = DC give V x A). null when unknown.
 */
export function powerKw(
  powerKwField: number,
  amps: number,
  volts: number,
  currentTypeId: number
): number | null {
  if (powerKwField > 0) return Math.round(powerKwField * 10) / 10
  if (!(amps > 0) || !(volts > 0)) return null
  let w = amps * volts
  if (currentTypeId === 20) w *= volts >= 380 ? Math.sqrt(3) : 3
  return Math.round(w / 100) / 10
}

function currentOf(id: number): 'AC' | 'DC' | null {
  if (id === 10 || id === 20) return 'AC'
  if (id === 30) return 'DC'
  return null
}

/** Usage types 2 (Private - Restricted Access), 3 (Privately Owned - Notice Required), 6 (Private - For Staff, Visitors or Customers). */
function restrictedUsage(id: number): boolean {
  return id === 2 || id === 3 || id === 6
}

/** Operators that mean "nobody in particular": 1 (Unknown Operator), 44 (Business Owner at Location), 45 (Private Individual). */
function placeholderOperator(id: number, title: string | null): boolean {
  return id === 1 || id === 44 || id === 45 || (title !== null && title.startsWith('('))
}

function validPoint(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * Normalises an OCM /v3/poi response (a JSON array, compact=false or true) into the v1 tile payload. POIs without a valid id or
 * coordinates are skipped. null when the document is not an array (an error page, a captive portal).
 */
export function normalizeOcm(body: unknown): TilePayload | null {
  if (!Array.isArray(body)) return null
  const stations: OcmStation[] = []
  const providers: Record<string, OcmProvider> = {}
  for (const raw of body) {
    const poi = obj(raw)
    if (!poi) continue
    const id = num(poi.ID)
    if (!Number.isInteger(id) || id <= 0) continue
    const a = obj(poi.AddressInfo)
    const lat = num(a?.Latitude)
    const lng = num(a?.Longitude)
    if (!validPoint(lat, lng)) continue

    const opTitle = cleanText(obj(poi.OperatorInfo)?.Title, 80)
    const opId = idOf(poi, 'OperatorID', 'OperatorInfo')

    const connectors: OcmConnector[] = []
    let best: StationStatus | null = null
    const conns = Array.isArray(poi.Connections) ? poi.Connections : []
    for (const rc of conns) {
      const c = obj(rc)
      if (!c) continue
      const typeId = idOf(c, 'ConnectionTypeID', 'ConnectionType')
      const currentId = idOf(c, 'CurrentTypeID', 'CurrentType')
      const qty = num(c.Quantity)
      connectors.push({
        type: connectorTypeOf(typeId, cleanText(obj(c.ConnectionType)?.Title, 80)),
        type_id: typeId > 0 ? typeId : null,
        kw: powerKw(num(c.PowerKW), num(c.Amps), num(c.Voltage), currentId),
        qty: Number.isInteger(qty) && qty > 0 ? Math.min(qty, 99) : 1,
        current: currentOf(currentId),
      })
      const cs = statusOf(idOf(c, 'StatusTypeID', 'StatusType'))
      if (cs !== 'unknown' && (best === null || STATUS_RANK.indexOf(cs) < STATUS_RANK.indexOf(best)))
        best = cs
    }
    let status = statusOf(idOf(poi, 'StatusTypeID', 'StatusType'))
    if (status === 'unknown' && best !== null) status = best

    const kws = connectors.map((c) => c.kw).filter((k): k is number => k !== null)
    const address = cleanText(a?.AddressLine1, 200)
    const country = cleanText(obj(a?.Country)?.ISOCode, 2)
    const providerId = idOf(poi, 'DataProviderID', 'DataProvider')
    const dp = obj(poi.DataProvider)
    if (providerId > 0 && dp && !providers[String(providerId)]) {
      const title = cleanText(dp.Title, 100)
      if (title) providers[String(providerId)] = { title, license: cleanText(dp.License, 200) }
    }

    stations.push({
      id,
      name: cleanText(a?.Title, 120) ?? address ?? `Estación ${id}`,
      operator: opTitle && !placeholderOperator(opId, opTitle) ? opTitle : null,
      lat,
      lng,
      address,
      town: cleanText(a?.Town, 80),
      country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
      status,
      restricted: restrictedUsage(idOf(poi, 'UsageTypeID', 'UsageType')),
      usage_cost: cleanText(poi.UsageCost, 120),
      verified_at: isoDate(poi.DateLastVerified),
      connectors,
      max_kw: kws.length > 0 ? Math.max(...kws) : null,
      provider_id: providerId > 0 ? providerId : null,
    })
  }
  return { v: 1, stations, providers }
}

/** A cached payload read back from the database, defensively (anything malformed is dropped). */
export function readPayload(v: unknown): TilePayload | null {
  const p = obj(v)
  if (!p || p.v !== 1 || !Array.isArray(p.stations)) return null
  const stations = p.stations.filter((s): s is OcmStation => {
    const o = obj(s)
    return (
      o !== null &&
      Number.isInteger(o.id) &&
      typeof o.name === 'string' &&
      validPoint(num(o.lat), num(o.lng)) &&
      Array.isArray(o.connectors)
    )
  })
  const providers: Record<string, OcmProvider> = {}
  const rawProviders = obj(p.providers)
  if (rawProviders) {
    for (const [k, val] of Object.entries(rawProviders)) {
      const pv = obj(val)
      if (pv && typeof pv.title === 'string') {
        providers[k] = { title: pv.title, license: typeof pv.license === 'string' ? pv.license : null }
      }
    }
  }
  return { v: 1, stations, providers }
}

export function applyFilter(stations: OcmStation[], f: StationFilter): OcmStation[] {
  if (!f.types && f.minKw === null) return stations
  return stations.filter((s) => {
    const conns = f.types
      ? s.connectors.filter((c) => c.type_id !== null && f.types!.includes(c.type_id))
      : s.connectors
    if (conns.length === 0) return false
    if (f.minKw !== null && !conns.some((c) => c.kw !== null && c.kw >= f.minKw!)) return false
    return true
  })
}

/** "Datos de Open Charge Map (CC BY 4.0)", plus every other data provider with its licence. */
export function attributionFor(providers: Record<string, OcmProvider>): string {
  const extra = Object.entries(providers)
    .filter(([id]) => id !== '1')
    .map(([, p]) => (p.license ? `${p.title}: ${p.license}` : p.title))
  return [OCM_ATTRIBUTION, ...extra].join('; ')
}

export function ocmTileUrl(t: Pick<Tile, 'i' | 'j'>): string {
  const a = tileArea(t)
  const params = new URLSearchParams({
    output: 'json',
    boundingbox: `(${a.north},${a.west}),(${a.south},${a.east})`,
    maxresults: String(OCM_MAX_RESULTS),
    compact: 'false',
    verbose: 'false',
    opendata: 'true',
    connectiontypeid: FETCH_CONNECTION_TYPES.join(','),
    client: 'wikivigo',
  })
  return `${OCM_ENDPOINT}?${params.toString()}`
}

// ---------------------------------------------------------------- client identity

const enc = (s: string) => new TextEncoder().encode(s)

/** Best-effort client IP: the first x-forwarded-for entry, else x-real-ip, else 'unknown' (spoofable: see the spec, D7). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = xff || req.headers.get('x-real-ip')?.trim() || 'unknown'
  return ip.slice(0, 64)
}

/** 32 hex chars of HMAC-SHA256(secret, ip): what the counters store instead of the IP. */
export async function clientId(secret: string, ip: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc(secret || 'ocm-stations'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(`ocm-client|${ip}`)))
  return Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------- handler

export type OcmErrorCode =
  | 'bad_request'
  | 'area_too_large'
  | 'origin'
  | 'method'
  | 'rate_limited'
  | 'upstream'
  | 'not_configured'
  | 'server'

const STATUS: Record<OcmErrorCode, number> = {
  bad_request: 400,
  area_too_large: 400,
  origin: 403,
  method: 405,
  rate_limited: 429,
  upstream: 502,
  not_configured: 503,
  server: 500,
}

export interface RpcResult {
  data: unknown
  error: string | null
}

/** Calls a SQL function with the service role (PostgREST /rest/v1/rpc). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export interface OcmDeps {
  rpc: Rpc
  fetch: FetchFn
  now: () => number
  /** OCM_API_KEY; '' when the secret is not set (only cached tiles are served). */
  ocmKey: string
  /** HMAC key for client ids (the service role key: never stored, never sent). */
  clientSecret: string
  allowedOrigins: readonly string[]
  log?: (message: string) => void
}

type FailReason = 'timeout' | 'network' | 'http' | 'bad_data' | 'auth' | 'rate_limited'

type TileFetch =
  { ok: true; payload: TilePayload; truncated: boolean } | { ok: false; reason: FailReason; detail: string }

export function parseAllowedOrigins(env: string | undefined): string[] {
  if (!env || !env.trim()) return [...DEFAULT_ALLOWED_ORIGINS]
  return env
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' }
  if (origin && allowed) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Expose-Headers'] = 'Retry-After'
  }
  return h
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

function fail(
  code: OcmErrorCode,
  cors: Record<string, string>,
  extra: Record<string, unknown> = {}
): Response {
  const headers: Record<string, string> = { ...cors, 'Cache-Control': 'no-store' }
  if (typeof extra.retry_after === 'number') headers['Retry-After'] = String(extra.retry_after)
  return json(STATUS[code], { ok: false, error: code, ...extra }, headers)
}

/** Reads at most `max` bytes of a response body as text; null when larger. */
async function readCappedText(res: Response, max: number): Promise<string | null> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return new TextDecoder().decode(out)
}

async function fetchTile(t: Tile, deps: OcmDeps): Promise<TileFetch> {
  try {
    const res = await deps.fetch(ocmTileUrl(t), {
      method: 'GET',
      headers: { 'X-API-Key': deps.ocmKey, Accept: 'application/json', 'User-Agent': OCM_USER_AGENT },
      // Never follow a redirect: the key header would travel with it.
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403)
      return { ok: false, reason: 'auth', detail: `HTTP ${res.status}` }
    if (res.status === 429) return { ok: false, reason: 'rate_limited', detail: 'HTTP 429' }
    if (!res.ok) return { ok: false, reason: 'http', detail: `HTTP ${res.status}` }
    const text = await readCappedText(res, MAX_UPSTREAM_BYTES)
    if (text === null) return { ok: false, reason: 'bad_data', detail: 'response too large' }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return { ok: false, reason: 'bad_data', detail: 'not JSON' }
    }
    const payload = normalizeOcm(body)
    if (!payload) return { ok: false, reason: 'bad_data', detail: 'not a POI array' }
    return { ok: true, payload, truncated: Array.isArray(body) && body.length >= OCM_MAX_RESULTS }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    const timeout = name === 'TimeoutError' || name === 'AbortError'
    return {
      ok: false,
      reason: timeout ? 'timeout' : 'network',
      detail: timeout ? 'timeout' : name || 'network error',
    }
  }
}

async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++
      out[idx] = await work(items[idx])
    }
  })
  await Promise.all(runners)
  return out
}

interface CachedTile {
  payload: TilePayload
  fetchedAt: string | null
  fresh: boolean
}

interface BeginResult {
  cached: Map<string, CachedTile>
  fetch: string[]
  linked: Set<number>
}

function readBegin(data: unknown, requested: Set<string>): BeginResult | { rateLimited: number } | null {
  const o = obj(data)
  if (!o) return null
  if (o.error === 'rate_limited') {
    const ra = num(o.retry_after)
    return { rateLimited: Number.isInteger(ra) && ra > 0 ? ra : 60 }
  }
  const cached = new Map<string, CachedTile>()
  for (const row of Array.isArray(o.tiles) ? o.tiles : []) {
    const r = obj(row)
    if (!r || typeof r.key !== 'string' || !requested.has(r.key)) continue
    const payload = readPayload(r.payload)
    if (!payload) continue
    cached.set(r.key, {
      payload,
      fetchedAt: typeof r.fetched_at === 'string' ? r.fetched_at : null,
      fresh: r.fresh === true,
    })
  }
  const fetch = (Array.isArray(o.fetch) ? o.fetch : []).filter(
    (k): k is string => typeof k === 'string' && requested.has(k)
  )
  const linked = new Set<number>(
    (Array.isArray(o.linked_ocm_ids) ? o.linked_ocm_ids : []).filter((n): n is number => Number.isInteger(n))
  )
  return { cached, fetch, linked }
}

export async function handleOcmStations(req: Request, deps: OcmDeps): Promise<Response> {
  const log = deps.log ?? (() => undefined)
  const origin = req.headers.get('origin')
  const originAllowed = origin === null || deps.allowedOrigins.includes(origin)
  const cors = corsHeaders(origin, originAllowed)
  if (!originAllowed) return fail('origin', cors)

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
  if (req.method !== 'GET') return fail('method', cors)

  const parsed = parseQuery(new URL(req.url).searchParams)
  if ('error' in parsed) return fail(parsed.error, cors)
  const { tiles, filter } = parsed
  const requested = new Set(tiles.map((t) => t.key))

  try {
    const client = await clientId(deps.clientSecret, clientIp(req))
    const beginRes = await deps.rpc('ocm_tiles_begin', {
      p_client: client,
      p_tiles: tiles.map((t) => t.key),
      p_can_fetch: deps.ocmKey !== '',
    })
    if (beginRes.error) {
      log(`ocm_tiles_begin failed: ${beginRes.error}`)
      return fail('server', cors)
    }
    const begin = readBegin(beginRes.data, requested)
    if (!begin) {
      log('ocm_tiles_begin: unexpected result')
      return fail('server', cors)
    }
    if ('rateLimited' in begin) return fail('rate_limited', cors, { retry_after: begin.rateLimited })

    // Upstream fetches granted by the database (budgets, leases, cooldowns).
    const toFetch = tiles.filter((t) => begin.fetch.includes(t.key))
    const results = deps.ocmKey ? await pool(toFetch, FETCH_CONCURRENCY, (t) => fetchTile(t, deps)) : []
    const fetched = new Map<string, { payload: TilePayload; truncated: boolean }>()
    const failures = new Map<FailReason, string[]>()
    toFetch.forEach((t, idx) => {
      const r = results[idx]
      if (!r) return
      if (r.ok) {
        fetched.set(t.key, { payload: r.payload, truncated: r.truncated })
      } else {
        log(`OCM ${t.key}: ${r.detail}`)
        failures.set(r.reason, [...(failures.get(r.reason) ?? []), t.key])
      }
    })

    if (fetched.size > 0) {
      const store = await deps.rpc('ocm_tiles_store', {
        p_tiles: [...fetched].map(([key, f]) => ({
          key,
          payload: f.payload,
          count: f.payload.stations.length,
          truncated: f.truncated,
        })),
      })
      if (store.error) log(`ocm_tiles_store failed: ${store.error}`)
    }
    for (const [reason, keys] of failures) {
      const res = await deps.rpc('ocm_tiles_fail', { p_keys: keys, p_reason: reason })
      if (res.error) log(`ocm_tiles_fail failed: ${res.error}`)
    }

    // Assemble, nearest tiles first.
    const nowIso = new Date(deps.now()).toISOString()
    const byId = new Map<number, OcmStation>()
    const providers: Record<string, OcmProvider> = {}
    let served = 0
    let stale = 0
    let missing = 0
    let truncated = false
    let oldest: string | null = null
    for (const t of tiles) {
      const f = fetched.get(t.key)
      const c = begin.cached.get(t.key)
      let payload: TilePayload
      let at: string | null
      if (f) {
        payload = f.payload
        at = nowIso
        if (f.truncated) truncated = true
      } else if (c) {
        payload = c.payload
        at = c.fetchedAt
        if (!c.fresh) stale++
      } else {
        missing++
        continue
      }
      served++
      if (at && (oldest === null || at < oldest)) oldest = at
      for (const s of payload.stations) if (!begin.linked.has(s.id) && !byId.has(s.id)) byId.set(s.id, s)
      Object.assign(providers, payload.providers)
    }

    if (served === 0 && missing > 0) {
      if (failures.size > 0) return fail('upstream', cors)
      if (!deps.ocmKey) return fail('not_configured', cors)
    }

    let stations = applyFilter([...byId.values()], filter)
    if (stations.length > MAX_RESPONSE_STATIONS) {
      stations = stations.slice(0, MAX_RESPONSE_STATIONS)
      truncated = true
    }
    const usedProviders = new Set(stations.map((s) => String(s.provider_id)))
    const shownProviders = Object.fromEntries(
      Object.entries(providers).filter(([id]) => usedProviders.has(id))
    )
    const complete = missing === 0 && !truncated
    const area = coveredArea(tiles)

    return json(
      200,
      {
        ok: true,
        stations: stations.map((s) => ({ ...s, url: `${OCM_DETAILS_URL}${s.id}` })),
        complete,
        truncated,
        retry_after: missing > 0 ? RETRY_AFTER_S : null,
        tiles: { requested: tiles.length, served, stale, missing },
        bbox: [area.south, area.west, area.north, area.east],
        tile_deg: TILE_DEG,
        oldest_fetch: oldest,
        attribution: attributionFor(shownProviders),
        providers: Object.entries(shownProviders).map(([id, p]) => ({
          id: Number(id),
          title: p.title,
          license: p.license,
        })),
      },
      { ...cors, 'Cache-Control': complete ? 'public, max-age=600' : 'no-store' }
    )
  } catch (e) {
    log(`ocm-stations: ${e instanceof Error ? e.message : String(e)}`)
    return fail('server', cors)
  }
}
