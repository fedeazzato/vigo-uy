// @vitest-environment node
// Real WebCrypto (Node), no network: the database is a fake `rpc` and Open
// Charge Map a fake `fetch`.
import { describe, it, expect, vi } from 'vitest'
import {
  applyFilter,
  attributionFor,
  clientId,
  clientIp,
  cleanText,
  connectorTypeOf,
  coveredArea,
  handleOcmStations,
  MAX_RESPONSE_STATIONS,
  normalizeOcm,
  ocmTileUrl,
  parseAllowedOrigins,
  parseQuery,
  powerKw,
  radiusArea,
  readPayload,
  statusOf,
  tileOf,
  tileRange,
  tilesFor,
  type OcmDeps,
  type OcmStation,
  type RpcResult,
  type TilePayload,
} from './ocmStations'

const KEY = 'ocm-test-key-0123456789'
const SECRET = 'service-role-test-secret'
const NOW = Date.parse('2026-11-20T12:00:00Z')
const SITE = 'https://fedeazzato.github.io'

// ---------------------------------------------------------------- fixtures

/** A compact=false / verbose=false OCM answer, shaped like the real API. */
const OCM_POIS = [
  {
    ID: 700001,
    DataProviderID: 1,
    DataProvider: {
      ID: 1,
      Title: 'Open Charge Map Contributors',
      License: 'Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)',
    },
    OperatorID: 3500,
    OperatorInfo: { ID: 3500, Title: 'YPF' },
    UsageTypeID: 1,
    UsageCost: 'ARS 450/kWh',
    AddressInfo: {
      Title: 'YPF Colón',
      AddressLine1: 'Ruta 135 km 3',
      Town: 'Colón',
      Country: { ISOCode: 'AR', Title: 'Argentina' },
      Latitude: -32.22,
      Longitude: -58.14,
    },
    Connections: [
      {
        ConnectionTypeID: 33,
        ConnectionType: { ID: 33, Title: 'CCS (Type 2)' },
        PowerKW: 120,
        CurrentTypeID: 30,
        Quantity: 2,
        StatusTypeID: 50,
      },
      {
        ConnectionTypeID: 1036,
        ConnectionType: { ID: 1036, Title: 'Type 2 (Tethered Connector) ' },
        Amps: 32,
        Voltage: 400,
        CurrentTypeID: 20,
        Quantity: 1,
      },
    ],
    StatusTypeID: 50,
    DateLastVerified: '2026-10-01T10:00:00Z',
  },
  {
    ID: 700002,
    DataProviderID: 1,
    OperatorID: 1,
    OperatorInfo: { ID: 1, Title: '(Unknown Operator)' },
    UsageTypeID: 6,
    AddressInfo: { Title: '  Parking\u0007 Centro  ', Town: 'Colón', Latitude: -32.23, Longitude: -58.15 },
    Connections: [{ ConnectionTypeID: 25, Amps: 16, Voltage: 230, CurrentTypeID: 10, StatusTypeID: 20 }],
  },
  { ID: 700003, AddressInfo: { Latitude: 0, Longitude: 0, Title: 'Null island' }, Connections: [] },
  { ID: -5, AddressInfo: { Latitude: -32.2, Longitude: -58.1 } },
  {
    ID: 700004,
    AddressInfo: { AddressLine1: 'Calle sin nombre 1', Latitude: -32.24, Longitude: -58.16 },
    StatusTypeID: 200,
    Connections: [{ ConnectionTypeID: 33, PowerKW: 50 }],
  },
  {
    ID: 700005,
    DataProviderID: 18,
    DataProvider: { ID: 18, Title: 'Some Open Registry', License: 'ODbL' },
    AddressInfo: { Title: 'Registry station', Latitude: -32.21, Longitude: -58.13 },
    Connections: [{ ConnectionTypeID: 1036, PowerKW: 22, CurrentTypeID: 20 }],
    StatusTypeID: 50,
  },
  'garbage',
]

function station(overrides: Partial<OcmStation> = {}): OcmStation {
  return {
    id: 1,
    name: 'Estación',
    operator: null,
    lat: -32.2,
    lng: -58.1,
    address: null,
    town: null,
    country: 'AR',
    status: 'operational',
    restricted: false,
    usage_cost: null,
    verified_at: null,
    connectors: [{ type: 'ccs2', type_id: 33, kw: 60, qty: 1, current: 'DC' }],
    max_kw: 60,
    provider_id: 1,
    ...overrides,
  }
}

function payload(stations: OcmStation[]): TilePayload {
  return {
    v: 1,
    stations,
    providers: { '1': { title: 'Open Charge Map Contributors', license: 'CC BY 4.0' } },
  }
}

// ---------------------------------------------------------------- tiles

describe('tile grid', () => {
  it('keys a point by floor(lat*2) and floor(lng*2), negatives included', () => {
    expect(tileOf(-32.22, -58.14).key).toBe('v1:-65:-117')
    expect(tileOf(0.1, 0.1).key).toBe('v1:0:0')
    expect(tileOf(-0.1, -0.1).key).toBe('v1:-1:-1')
    expect(tileOf(-34.5, -58).key).toBe('v1:-69:-116')
  })

  it('does not pull in the next tile for an edge exactly on a grid line', () => {
    expect(tileRange({ south: -33, west: -58.5, north: -32.5, east: -58 }).count).toBe(1)
    expect(tileRange({ south: -33, west: -58.5, north: -32.49, east: -58 }).count).toBe(2)
  })

  it('orders tiles nearest to the centre first', () => {
    const tiles = tilesFor({ south: -33.4, west: -58.9, north: -31.9, east: -57.4 })
    expect(tiles).toHaveLength(16)
    const centre = tileOf(-32.65, -58.15).key
    expect(tiles.slice(0, 4).map((t) => t.key)).toContain(centre)
    expect(new Set(tiles.map((t) => t.key)).size).toBe(16)
  })

  it('turns a radius into a box and the box back into whole tiles', () => {
    const a = radiusArea(-32.22, -58.14, 25)
    expect(a.north - a.south).toBeCloseTo((2 * 25) / 111.32, 5)
    expect(a.east - a.west).toBeGreaterThan(a.north - a.south) // longitude degrees are shorter at 32 S
    const tiles = tilesFor(a)
    expect(tiles).toHaveLength(4)
    expect(coveredArea(tiles)).toEqual({ south: -32.5, west: -58.5, north: -31.5, east: -57.5 })
  })

  it('builds the OCM URL per tile with the box, the fetched sockets and opendata, and no key', () => {
    const u = new URL(ocmTileUrl({ i: -65, j: -117 }))
    expect(u.origin + u.pathname).toBe('https://api.openchargemap.io/v3/poi/')
    expect(u.searchParams.get('boundingbox')).toBe('(-32,-58.5),(-32.5,-58)')
    expect(u.searchParams.get('connectiontypeid')).toBe('33,25,1036')
    expect(u.searchParams.get('opendata')).toBe('true')
    expect(u.searchParams.get('maxresults')).toBe('1000')
    expect(u.searchParams.get('compact')).toBe('false')
    expect(u.searchParams.get('verbose')).toBe('false')
    expect(u.search).not.toMatch(/key/i)
  })
})

// ---------------------------------------------------------------- query parsing

describe('parseQuery', () => {
  const q = (s: string) => parseQuery(new URLSearchParams(s))

  it('accepts a bbox and a lat/lng/radius', () => {
    const a = q('bbox=-32.5,-58.5,-32,-58')
    expect('error' in a).toBe(false)
    if (!('error' in a)) expect(a.tiles.map((t) => t.key)).toEqual(['v1:-65:-117'])
    const b = q('lat=-32.22&lng=-58.14&radius_km=26')
    expect('error' in b).toBe(false)
  })

  it('rejects malformed, inverted, out-of-range, antimeridian and mixed areas', () => {
    for (const s of [
      '',
      'bbox=1,2,3',
      'bbox=a,b,c,d',
      'bbox=-32,-58.5,-32.5,-58',
      'bbox=-32.5,170,-32,-170',
      'bbox=-95,-58,-32,-57',
      'bbox=-32.5,-58.5,-32,-58&lat=-32',
      'lat=-32&lng=-58',
      'lat=-32&lng=-58&radius_km=0',
      'lat=-32&lng=-58&radius_km=61',
      'lat=-32&lng=-58&radius_km=-5',
      'lat=-91&lng=-58&radius_km=5',
      'lat=1e1&lng=-58&radius_km=5',
    ]) {
      expect(q(s), s).toEqual({ error: 'bad_request' })
    }
  })

  it('rejects more than 20 tiles', () => {
    expect(q('bbox=-34,-60,-31,-57')).toEqual({ error: 'area_too_large' }) // 6 x 6
    expect('error' in q('bbox=-34,-60,-32,-57.5')).toBe(false) // 4 x 5 = 20
  })

  it('validates the filters against the fetched sockets', () => {
    const ok = q('bbox=-32.5,-58.5,-32,-58&connectiontypeid=33,25,33&min_kw=50')
    expect('error' in ok ? null : ok.filter).toEqual({ types: [33, 25], minKw: 50 })
    expect(q('bbox=-32.5,-58.5,-32,-58&connectiontypeid=2')).toEqual({ error: 'bad_request' })
    expect(q('bbox=-32.5,-58.5,-32,-58&connectiontypeid=')).toEqual({ error: 'bad_request' })
    expect(q('bbox=-32.5,-58.5,-32,-58&min_kw=2000')).toEqual({ error: 'bad_request' })
    expect(q('bbox=-32.5,-58.5,-32,-58&min_kw=abc')).toEqual({ error: 'bad_request' })
  })
})

// ---------------------------------------------------------------- normalisation

describe('normalizeOcm', () => {
  const p = normalizeOcm(OCM_POIS)!

  it('keeps valid POIs only (id and coordinates)', () => {
    expect(p.stations.map((s) => s.id)).toEqual([700001, 700002, 700004, 700005])
  })

  it('maps names, operators, places, cost, verification and provider', () => {
    const s = p.stations[0]
    expect(s).toMatchObject({
      name: 'YPF Colón',
      operator: 'YPF',
      address: 'Ruta 135 km 3',
      town: 'Colón',
      country: 'AR',
      status: 'operational',
      restricted: false,
      usage_cost: 'ARS 450/kWh',
      verified_at: '2026-10-01T10:00:00.000Z',
      provider_id: 1,
      max_kw: 120,
    })
    expect(p.providers['1'].title).toBe('Open Charge Map Contributors')
    expect(p.providers['18']).toEqual({ title: 'Some Open Registry', license: 'ODbL' })
  })

  it('maps connectors with type, kW (given, three-phase, single-phase) and quantity', () => {
    expect(p.stations[0].connectors).toEqual([
      { type: 'ccs2', type_id: 33, kw: 120, qty: 2, current: 'DC' },
      { type: 'type2', type_id: 1036, kw: 22.2, qty: 1, current: 'AC' },
    ])
    expect(p.stations[1].connectors).toEqual([
      { type: 'type2_socket', type_id: 25, kw: 3.7, qty: 1, current: 'AC' },
    ])
  })

  it('drops placeholder operators, cleans control characters, flags restricted usage, takes the connector status', () => {
    const s = p.stations[1]
    expect(s.operator).toBeNull()
    expect(s.name).toBe('Parking Centro')
    expect(s.restricted).toBe(true)
    expect(s.status).toBe('in_use')
  })

  it('falls back to the address for the name and keeps removed POIs with their status', () => {
    expect(p.stations[2]).toMatchObject({ name: 'Calle sin nombre 1', status: 'removed' })
  })

  it('refuses a document that is not an array', () => {
    expect(normalizeOcm({ error: 'x' })).toBeNull()
    expect(normalizeOcm('<html>')).toBeNull()
  })

  it('maps statuses, connector titles and power like the car app', () => {
    expect([10, 50, 20, 75, 30, 100, 150, 200, 210, 0].map(statusOf)).toEqual([
      'available',
      'operational',
      'in_use',
      'partly',
      'temp_unavailable',
      'out_of_service',
      'planned',
      'removed',
      'removed',
      'unknown',
    ])
    expect(connectorTypeOf(0, 'GB-T AC - GB/T 20234.2 (Socket)')).toBe('gbt')
    expect(connectorTypeOf(0, 'CCS (Type 1)')).toBe('ccs1')
    expect(connectorTypeOf(2, null)).toBe('chademo')
    expect(connectorTypeOf(9999, null)).toBe('other')
    expect(powerKw(NaN, 32, 230, 20)).toBe(22.1)
    expect(powerKw(NaN, 125, 400, 30)).toBe(50)
    expect(powerKw(NaN, NaN, 230, 10)).toBeNull()
    expect(powerKw(7.36, NaN, NaN, 10)).toBe(7.4)
  })

  it('caps text and reads cached payloads defensively', () => {
    expect(cleanText('x'.repeat(300), 120)).toHaveLength(120)
    expect(cleanText('   ', 10)).toBeNull()
    expect(cleanText(5, 10)).toBeNull()
    expect(readPayload({ v: 2, stations: [] })).toBeNull()
    const back = readPayload({
      v: 1,
      stations: [station(), { id: 'x' }, null],
      providers: { '1': { title: 'OCM' }, '2': 5 },
    })
    expect(back?.stations).toHaveLength(1)
    expect(back?.providers).toEqual({ '1': { title: 'OCM', license: null } })
  })
})

describe('filters and attribution', () => {
  const stations = [
    station({ id: 1, connectors: [{ type: 'ccs2', type_id: 33, kw: 120, qty: 1, current: 'DC' }] }),
    station({ id: 2, connectors: [{ type: 'type2', type_id: 1036, kw: 22, qty: 1, current: 'AC' }] }),
    station({ id: 3, connectors: [{ type: 'type2_socket', type_id: 25, kw: null, qty: 1, current: 'AC' }] }),
  ]

  it('keeps stations with a selected socket that reaches the minimum power', () => {
    expect(applyFilter(stations, { types: null, minKw: null }).map((s) => s.id)).toEqual([1, 2, 3])
    expect(applyFilter(stations, { types: [33], minKw: null }).map((s) => s.id)).toEqual([1])
    expect(applyFilter(stations, { types: [1036, 25], minKw: null }).map((s) => s.id)).toEqual([2, 3])
    expect(applyFilter(stations, { types: null, minKw: 50 }).map((s) => s.id)).toEqual([1])
    expect(applyFilter(stations, { types: [1036], minKw: 50 }).map((s) => s.id)).toEqual([])
  })

  it('credits Open Charge Map and every other provider with its licence', () => {
    expect(attributionFor({ '1': { title: 'Open Charge Map Contributors', license: 'CC BY 4.0' } })).toBe(
      'Datos de Open Charge Map (CC BY 4.0)'
    )
    expect(
      attributionFor({
        '18': { title: 'Some Open Registry', license: 'ODbL' },
        '19': { title: 'X', license: null },
      })
    ).toBe('Datos de Open Charge Map (CC BY 4.0); Some Open Registry: ODbL; X')
  })

  it('parses the origin allow-list', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([SITE, 'http://localhost:5173'])
    expect(parseAllowedOrigins(' https://a.example/ , https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })
})

describe('client identity', () => {
  it('takes the first forwarded address and stores only a keyed hash of it', async () => {
    const req = new Request('https://x.example/', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })
    expect(clientIp(req)).toBe('203.0.113.7')
    expect(clientIp(new Request('https://x.example/'))).toBe('unknown')
    const id = await clientId(SECRET, '203.0.113.7')
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(id).not.toContain('203')
    expect(await clientId(SECRET, '203.0.113.7')).toBe(id)
    expect(await clientId('other-secret', '203.0.113.7')).not.toBe(id)
  })
})

// ---------------------------------------------------------------- handler

interface FakeDb {
  cached: Record<string, { payload: TilePayload; fresh: boolean; fetched_at?: string }>
  grant: 'all' | 'none' | string[]
  linked: number[]
  rateLimited?: boolean
  beginError?: string
}

function setup(
  db: Partial<FakeDb> = {},
  opts: { ocmKey?: string; ocm?: (url: string) => Response | Promise<Response> } = {}
) {
  const state: FakeDb = { cached: {}, grant: 'all', linked: [], ...db }
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const logs: string[] = []
  const rpc = vi.fn((fn: string, args: Record<string, unknown>): Promise<RpcResult> =>
    Promise.resolve(answer(fn, args))
  )
  function answer(fn: string, args: Record<string, unknown>): RpcResult {
    calls.push({ fn, args })
    if (fn === 'ocm_tiles_begin') {
      if (state.beginError) return { data: null, error: state.beginError }
      if (state.rateLimited) return { data: { error: 'rate_limited', retry_after: 120 }, error: null }
      const keys = args.p_tiles as string[]
      const wanted = keys.filter((k) => !state.cached[k]?.fresh)
      const fetch =
        args.p_can_fetch === false || state.grant === 'none'
          ? []
          : state.grant === 'all'
            ? wanted
            : wanted.filter((k) => (state.grant as string[]).includes(k))
      return {
        data: {
          tiles: keys
            .filter((k) => state.cached[k])
            .map((k) => ({
              key: k,
              payload: state.cached[k].payload,
              fetched_at: state.cached[k].fetched_at ?? '2026-11-20T08:00:00+00:00',
              fresh: state.cached[k].fresh,
            })),
          fetch,
          throttled: fetch.length < wanted.length,
          linked_ocm_ids: state.linked,
        },
        error: null,
      }
    }
    return { data: fn === 'ocm_tiles_store' ? 1 : null, error: null }
  }
  const fetchUrls: string[] = []
  const fetchInits: RequestInit[] = []
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    fetchUrls.push(url)
    fetchInits.push(init)
    return opts.ocm ? opts.ocm(url) : new Response(JSON.stringify(OCM_POIS), { status: 200 })
  })
  const deps: OcmDeps = {
    rpc,
    fetch: fetchFn,
    now: () => NOW,
    ocmKey: opts.ocmKey ?? KEY,
    clientSecret: SECRET,
    allowedOrigins: [SITE, 'http://localhost:5173'],
    log: (m) => logs.push(m),
  }
  return { deps, calls, logs, fetchUrls, fetchInits, fetchFn }
}

const COLON = 'lat=-32.22&lng=-58.14&radius_km=5' // one tile: v1:-65:-117
const TILE = 'v1:-65:-117'

function get(query: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://ref.supabase.co/functions/v1/ocm-stations?${query}`, {
    method,
    headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
  })
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('handleOcmStations', () => {
  it('serves a fresh cached tile without calling Open Charge Map', async () => {
    const { deps, fetchFn, calls } = setup({
      cached: { [TILE]: { payload: payload([station({ id: 9 })]), fresh: true } },
    })
    const res = await handleOcmStations(get(COLON), deps)
    expect(res.status).toBe(200)
    const b = await body(res)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(b).toMatchObject({
      ok: true,
      complete: true,
      truncated: false,
      retry_after: null,
      attribution: 'Datos de Open Charge Map (CC BY 4.0)',
    })
    expect(b.tiles).toEqual({ requested: 1, served: 1, stale: 0, missing: 0 })
    expect((b.stations as OcmStation[])[0]).toMatchObject({
      id: 9,
      url: 'https://openchargemap.org/site/poi/details/9',
    })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600')
    const begin = calls.find((c) => c.fn === 'ocm_tiles_begin')!
    expect(begin.args).toMatchObject({ p_tiles: [TILE], p_can_fetch: true })
    expect(begin.args.p_client).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(begin.args)).not.toContain('203.0.113.7')
  })

  it('fetches a cold tile once with the key in the header only, stores it and answers it', async () => {
    const { deps, fetchUrls, fetchInits, calls, logs } = setup()
    const res = await handleOcmStations(get(COLON), deps)
    const b = await body(res)
    expect(fetchUrls).toHaveLength(1)
    expect(fetchUrls[0]).toContain('boundingbox=%28-32%2C-58.5%29%2C%28-32.5%2C-58%29')
    expect(fetchUrls[0]).not.toContain(KEY)
    const headers = fetchInits[0].headers as Record<string, string>
    expect(headers['X-API-Key']).toBe(KEY)
    expect(headers['User-Agent']).toBe('WikiVigo/1 (ocm-stations)')
    expect(fetchInits[0].redirect).toBe('error')
    const store = calls.find((c) => c.fn === 'ocm_tiles_store')!
    const stored = (
      store.args.p_tiles as { key: string; payload: TilePayload; count: number; truncated: boolean }[]
    )[0]
    expect(stored).toMatchObject({ key: TILE, count: 4, truncated: false })
    expect(stored.payload.v).toBe(1)
    expect((b.stations as OcmStation[]).map((s) => s.id)).toEqual([700001, 700002, 700004, 700005])
    expect(b.attribution).toBe('Datos de Open Charge Map (CC BY 4.0); Some Open Registry: ODbL')
    expect(b.providers).toHaveLength(2)
    const everything = JSON.stringify(b) + JSON.stringify(calls) + logs.join('\n')
    expect(everything).not.toContain(KEY)
  })

  it('leaves out OCM POIs already linked to WikiVigo stations and applies the filters', async () => {
    const { deps } = setup({ linked: [700001] })
    const b = await body(await handleOcmStations(get(`${COLON}&connectiontypeid=1036`), deps))
    expect((b.stations as OcmStation[]).map((s) => s.id)).toEqual([700005])
  })

  it('serves stale data when Open Charge Map fails, and records the failure', async () => {
    const { deps, calls, logs } = setup(
      { cached: { [TILE]: { payload: payload([station({ id: 5 })]), fresh: false } } },
      { ocm: () => new Response('<html>Server error</html>', { status: 500 }) }
    )
    const res = await handleOcmStations(get(COLON), deps)
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b).toMatchObject({ complete: true, tiles: { requested: 1, served: 1, stale: 1, missing: 0 } })
    expect(calls.find((c) => c.fn === 'ocm_tiles_fail')?.args).toEqual({ p_keys: [TILE], p_reason: 'http' })
    expect(logs.join('\n')).toContain('HTTP 500')
    expect(logs.join('\n')).not.toContain('Server error')
  })

  it('answers 502 when nothing could be served after an upstream failure', async () => {
    const { deps, calls } = setup({}, { ocm: () => new Response('', { status: 403 }) })
    const res = await handleOcmStations(get(COLON), deps)
    expect(res.status).toBe(502)
    expect(await body(res)).toEqual({ ok: false, error: 'upstream' })
    expect(calls.find((c) => c.fn === 'ocm_tiles_fail')?.args).toEqual({ p_keys: [TILE], p_reason: 'auth' })
  })

  it('classifies timeouts, network errors, rate limits and non-POI answers', async () => {
    const timeout = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })
    const cases: [() => Response | Promise<Response>, string][] = [
      [() => Promise.reject(timeout), 'timeout'],
      [() => Promise.reject(new TypeError('fetch failed')), 'network'],
      [() => new Response('slow down', { status: 429 }), 'rate_limited'],
      [() => new Response('{"error":"x"}', { status: 200 }), 'bad_data'],
      [() => new Response('<html>portal</html>', { status: 200 }), 'bad_data'],
    ]
    for (const [ocm, reason] of cases) {
      const { deps, calls } = setup({}, { ocm })
      await handleOcmStations(get(COLON), deps)
      expect(calls.find((c) => c.fn === 'ocm_tiles_fail')?.args.p_reason, reason).toBe(reason)
    }
  })

  it('marks the answer incomplete when the database did not grant every cold tile', async () => {
    const { deps, fetchUrls } = setup({ grant: 'none' })
    const res = await handleOcmStations(get('bbox=-32.5,-58.5,-32,-57.5'), deps)
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(fetchUrls).toHaveLength(0)
    expect(b).toMatchObject({
      complete: false,
      retry_after: 5,
      stations: [],
      tiles: { requested: 2, served: 0, stale: 0, missing: 2 },
    })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('without a key serves cached tiles only, and says not_configured when nothing is cached', async () => {
    const empty = setup({}, { ocmKey: '' })
    const res = await handleOcmStations(get(COLON), empty.deps)
    expect(res.status).toBe(503)
    expect(await body(res)).toEqual({ ok: false, error: 'not_configured' })
    expect(empty.calls[0].args.p_can_fetch).toBe(false)
    expect(empty.fetchFn).not.toHaveBeenCalled()

    const warm = setup(
      { cached: { [TILE]: { payload: payload([station({ id: 3 })]), fresh: false } } },
      { ocmKey: '' }
    )
    const b = await body(await handleOcmStations(get(COLON), warm.deps))
    expect(b).toMatchObject({ ok: true, complete: true, tiles: { stale: 1 } })
    expect(warm.fetchFn).not.toHaveBeenCalled()
  })

  it('merges POIs repeated on tile edges and caps the answer, nearest tiles first', async () => {
    const many = Array.from({ length: MAX_RESPONSE_STATIONS }, (_, k) => station({ id: 10_000 + k }))
    const centre = tilesFor(parseQueryArea('bbox=-32.5,-58.5,-32,-57.5'))[0].key
    const other = centre === TILE ? 'v1:-65:-116' : TILE
    const { deps } = setup({
      cached: {
        [centre]: { payload: payload(many), fresh: true },
        [other]: { payload: payload([station({ id: 10_000 }), station({ id: 99 })]), fresh: true },
      },
    })
    const b = await body(await handleOcmStations(get('bbox=-32.5,-58.5,-32,-57.5'), deps))
    const ids = (b.stations as OcmStation[]).map((s) => s.id)
    expect(ids).toHaveLength(MAX_RESPONSE_STATIONS)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(99)
    expect(b).toMatchObject({ truncated: true, complete: false, retry_after: null })
  })

  it('maps the database rate limit to 429 with Retry-After', async () => {
    const { deps } = setup({ rateLimited: true })
    const res = await handleOcmStations(get(COLON), deps)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('120')
    expect(await body(res)).toEqual({ ok: false, error: 'rate_limited', retry_after: 120 })
  })

  it('hides database failures behind a 500', async () => {
    const { deps, logs } = setup({ beginError: '500 relation "ocm_tile_cache" does not exist' })
    const res = await handleOcmStations(get(COLON), deps)
    expect(res.status).toBe(500)
    expect(await body(res)).toEqual({ ok: false, error: 'server' })
    expect(logs[0]).toContain('ocm_tiles_begin failed')
  })

  it('rejects bad requests, other methods and foreign browser origins', async () => {
    const { deps, calls } = setup()
    expect((await handleOcmStations(get('bbox=1,2'), deps)).status).toBe(400)
    const big = await handleOcmStations(get('bbox=-40,-70,-30,-50'), deps)
    expect(big.status).toBe(400)
    expect(await body(big)).toEqual({ ok: false, error: 'area_too_large' })
    expect((await handleOcmStations(get(COLON, {}, 'POST'), deps)).status).toBe(405)
    const foreign = await handleOcmStations(get(COLON, { origin: 'https://evil.example' }), deps)
    expect(foreign.status).toBe(403)
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('answers CORS for the site and nothing CORS-related for clients without an Origin', async () => {
    const { deps } = setup({ cached: { [TILE]: { payload: payload([station()]), fresh: true } } })
    const pre = await handleOcmStations(get(COLON, { origin: SITE }, 'OPTIONS'), deps)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(pre.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    const site = await handleOcmStations(get(COLON, { origin: SITE }), deps)
    expect(site.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(site.headers.get('Vary')).toBe('Origin')
    const car = await handleOcmStations(get(COLON), deps)
    expect(car.status).toBe(200)
    expect(car.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

function parseQueryArea(query: string) {
  const p = parseQuery(new URLSearchParams(query))
  if ('error' in p) throw new Error(p.error)
  return p.area
}
