import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attributionHtml,
  connectorsText,
  fetchOcmStations,
  ocmDetailsUrl,
  ocmFilterFor,
  ocmFunctionBase,
  ocmRequest,
  verifiedText,
  visibleOcmStations,
  type OcmStation,
} from './ocmStations'

const BASE = 'https://ref.supabase.co'

function station(overrides: Partial<OcmStation> = {}): OcmStation {
  return {
    id: 1,
    name: 'YPF Colón',
    operator: 'YPF',
    lat: -32.22,
    lng: -58.14,
    address: null,
    town: 'Colón',
    country: 'AR',
    status: 'operational',
    restricted: false,
    usage_cost: null,
    verified_at: null,
    connectors: [{ type: 'ccs2', type_id: 33, kw: 120, qty: 2, current: 'DC' }],
    max_kw: 120,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('ocmRequest', () => {
  it('snaps the view to whole 0.5-degree tiles so small pans keep the same URL', () => {
    const a = ocmRequest(BASE, { south: -32.31, west: -58.27, north: -32.02, east: -57.93 }, {})
    const b = ocmRequest(BASE, { south: -32.4, west: -58.4, north: -32.1, east: -57.6 }, {})
    expect(a).toEqual({
      kind: 'ok',
      url: `${BASE}/functions/v1/ocm-stations?bbox=-32.5%2C-58.5%2C-32%2C-57.5`,
    })
    expect(b).toEqual(a)
  })

  it('passes the filters and refuses views wider than 20 tiles or across the antimeridian', () => {
    const r = ocmRequest(
      BASE,
      { south: -32.4, west: -58.4, north: -32.1, east: -58.1 },
      { connectiontypeid: [33], minKw: 50 }
    )
    expect(r.kind === 'ok' && new URL(r.url).searchParams.get('connectiontypeid')).toBe('33')
    expect(r.kind === 'ok' && new URL(r.url).searchParams.get('min_kw')).toBe('50')
    expect(ocmRequest(BASE, { south: -35, west: -58.5, north: -30, east: -53 }, {})).toEqual({
      kind: 'too_large',
    })
    expect(ocmRequest(BASE, { south: -34, west: -60, north: -32, east: -57.5 }, {}).kind).toBe('ok') // 4 x 5
    expect(ocmRequest(BASE, { south: -34, west: 179, north: -33, east: 181 }, {})).toEqual({
      kind: 'unsupported',
    })
  })

  it('reads the function base from the Supabase URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co/')
    expect(ocmFunctionBase()).toBe(BASE)
    vi.stubEnv('VITE_SUPABASE_URL', '')
    expect(ocmFunctionBase()).toBeNull()
  })
})

describe('ocmFilterFor', () => {
  it('maps the WikiVigo connector and power filters to OCM ids', () => {
    expect(ocmFilterFor('', '')).toEqual({})
    expect(ocmFilterFor('CCS2', '60')).toEqual({ connectiontypeid: [33], minKw: 60 })
    expect(ocmFilterFor('Tipo 2', '')).toEqual({ connectiontypeid: [1036] })
    expect(ocmFilterFor('Sin cable', '')).toEqual({ connectiontypeid: [25] })
    expect(ocmFilterFor('GB/T', '')).toBeNull()
    expect(ocmFilterFor('Tipo 1', '30')).toBeNull()
  })
})

describe('fetchOcmStations', () => {
  function answer(status: number, body: unknown) {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('returns the stations of a good answer, sending no custom headers', async () => {
    const fetchMock = answer(200, {
      ok: true,
      stations: [station(), { id: 'bad' }],
      complete: false,
      retry_after: 5,
      attribution: 'Datos de Open Charge Map (CC BY 4.0)',
    })
    const res = await fetchOcmStations(`${BASE}/functions/v1/ocm-stations?bbox=1,2,3,4`)
    expect(res).toEqual({
      ok: true,
      answer: {
        stations: [station()],
        complete: false,
        retryAfter: 5,
        attribution: 'Datos de Open Charge Map (CC BY 4.0)',
      },
    })
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.headers).toBeUndefined()
  })

  it('turns the function error codes into Spanish messages', async () => {
    const cases: [number, string, string][] = [
      [429, 'rate_limited', 'Demasiadas consultas a Open Charge Map. Probá de nuevo en unos minutos.'],
      [503, 'not_configured', 'Las estaciones de Open Charge Map todavía no están disponibles.'],
      [502, 'upstream', 'Open Charge Map no respondió. Probá de nuevo más tarde.'],
      [500, 'server', 'No se pudieron cargar las estaciones de Open Charge Map.'],
    ]
    for (const [status, error, message] of cases) {
      answer(status, { ok: false, error })
      expect(await fetchOcmStations('u')).toEqual({ ok: false, message })
    }
  })

  it('reports a network failure, and nothing when aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    )
    expect(await fetchOcmStations('u')).toEqual({ ok: false, message: 'Sin conexión con Open Charge Map.' })
    const c = new AbortController()
    c.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError')))
    )
    expect(await fetchOcmStations('u', c.signal)).toBeNull()
  })
})

describe('display helpers', () => {
  it('hides removed/planned stations and those within 50 m of a WikiVigo station', () => {
    const near = station({ id: 2, lat: -32.2203, lng: -58.1403 }) // about 40 m away
    const far = station({ id: 3, lat: -32.23, lng: -58.15 })
    const removed = station({ id: 4, lat: -32.3, status: 'removed' })
    const planned = station({ id: 5, lat: -32.4, status: 'planned' })
    expect(
      visibleOcmStations([near, far, removed, planned], [{ lat: -32.22, lng: -58.14 }]).map((s) => s.id)
    ).toEqual([3])
  })

  it('formats connectors, dates, links and a safe attribution', () => {
    expect(
      connectorsText([
        { type: 'ccs2', type_id: 33, kw: 120, qty: 2, current: 'DC' },
        { type: 'type2', type_id: 1036, kw: 22.2, qty: 1, current: 'AC' },
        { type: 'type2_socket', type_id: 25, kw: null, qty: 1, current: 'AC' },
      ])
    ).toBe('CCS2 ×2 (120 kW), Tipo 2 (22,2 kW), Tipo 2 sin cable')
    expect(verifiedText('2026-10-01T10:00:00Z')).toMatch(/2026/)
    expect(verifiedText(null)).toBeNull()
    expect(verifiedText('nope')).toBeNull()
    expect(ocmDetailsUrl(123)).toBe('https://openchargemap.org/site/poi/details/123')
    expect(attributionHtml('Datos; <img src=x onerror=alert(1)>')).toBe(
      '<a href="https://openchargemap.org/" target="_blank" rel="noopener noreferrer">Datos; &#60;img src=x onerror=alert(1)&#62;</a>'
    )
  })
})
