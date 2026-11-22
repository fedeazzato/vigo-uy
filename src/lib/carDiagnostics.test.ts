// @vitest-environment node
// (Node has the web CompressionStream/DecompressionStream the browser uses.)
// specs/car-diagnostics.md test plan: join parts, gunzip in the "browser" (DecompressionStream), parse Mi Vigo's report, plain text.
import { describe, it, expect } from 'vitest'
import {
  appLabel,
  gunzipBase64,
  joinParts,
  membersLabel,
  parseReport,
  reportCode,
  reportToText,
  summarizeApps,
  vehicleFallbackLabel,
} from './carDiagnostics'

// What Mi Vigo 2.4 builds (accounts_proxy core DiagReport.combinedJson), already redacted on the car
const REPORT = {
  schema: 1,
  created_at: 1763640000000,
  mivigo: '2.4',
  device_build: 'V01811 · Android 10 · DFRD',
  location: false,
  note: 'Se cerró Carga al enchufar',
  apps: [
    {
      app: 'com.vigo.accountslauncher',
      label: 'Mi Vigo',
      state: 'ok',
      version: '2.4 (7)',
      device_build: 'V01811',
      truncated: false,
      log: '2026-11-21 10:00:00.000 -0300 I VigoAccounts: heartbeat: OK\n',
      crashes: [],
    },
    {
      app: 'com.vigo.carga',
      label: 'Carga',
      state: 'ok',
      version: '0.4',
      device_build: '',
      truncated: true,
      log: 'fix lat=<ubicación>\n',
      crashes: ['=== crash 2026-11-21 thread main\njava.lang.IllegalStateException\n'],
    },
    {
      app: 'com.vigo.tts.es',
      label: 'Voz en español',
      state: 'not_installed',
      version: '',
      device_build: '',
      truncated: false,
      log: '',
      crashes: [],
    },
  ],
}

async function b64(s: string): Promise<string> {
  const stream = new Blob([new TextEncoder().encode(s)]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

describe('carDiagnostics', () => {
  it('joins parts in order and refuses a missing one', () => {
    expect(
      joinParts(
        [
          { part: 1, data: 'CD' },
          { part: 0, data: 'AB' },
        ],
        2
      )
    ).toBe('ABCD')
    expect(joinParts([{ part: 0, data: 'AB' }], 2)).toBeNull()
  })

  it('gunzips the joined base64 back to the report (split at 4-character boundaries like the car)', async () => {
    const all = await b64(JSON.stringify(REPORT))
    const parts = [all.slice(0, 24), all.slice(24)].map((data, part) => ({ part, data }))
    const text = await gunzipBase64(joinParts(parts, 2) as string)
    expect(JSON.parse(text)).toEqual(REPORT)
  })

  it('keeps non-ASCII text intact', async () => {
    expect(await gunzipBase64(await b64('ubicación ñandú'))).toBe('ubicación ñandú')
  })

  it('rejects bad gzip', async () => {
    await expect(gunzipBase64(btoa('not gzip'))).rejects.toBeTruthy()
  })

  it('parses the report and refuses other shapes', () => {
    const r = parseReport(JSON.stringify(REPORT))
    expect(r?.apps).toHaveLength(3)
    expect(r?.apps[1]).toMatchObject({
      label: 'Carga',
      truncated: true,
      crashes: [expect.stringContaining('IllegalState')],
    })
    expect(parseReport('{"schema":2,"apps":[]}')).toBeNull()
    expect(parseReport('nope')).toBeNull()
    const odd = { ...REPORT, apps: [{ nope: 1 }, { app: 'x', crashes: [1, 'c'] }] }
    expect(parseReport(JSON.stringify(odd))?.apps).toEqual([
      expect.objectContaining({ app: 'x', label: 'x', state: 'invalid', crashes: ['c'] }),
    ])
  })

  it('plain text has the header, the note, crashes before the log', () => {
    const report = parseReport(JSON.stringify(REPORT))
    expect(report).not.toBeNull()
    const t = reportToText(report as NonNullable<typeof report>, '0b9d6a7e-1c2f-4e3d-8a5b-9c0d1e2f3a4b')
    expect(t).toContain('Diagnóstico 0b9d6a7e-1c2f-4e3d-8a5b-9c0d1e2f3a4b')
    expect(t).toContain('Nota: Se cerró Carga al enchufar')
    expect(t).toContain('Ubicación incluida: no')
    expect(t).toContain('==== Carga (com.vigo.carga) 0.4 · respondió · recortado')
    expect(t.indexOf('---- cierre inesperado 1')).toBeLessThan(t.indexOf('fix lat=<ubicación>'))
    expect(t).toContain('==== Voz en español (com.vigo.tts.es)  · no instalada')
  })

  it('summarizes the part-0 apps defensively and names packages', () => {
    expect(
      summarizeApps([
        { app: 'com.vigo.carga', version: '0.4', state: 'ok', crashes: 1, chars: 9 },
        7,
        { x: 1 },
      ])
    ).toEqual([{ app: 'com.vigo.carga', version: '0.4', state: 'ok', crashes: 1, chars: 9 }])
    expect(summarizeApps(null)).toEqual([])
    expect(appLabel('com.df.autonavi')).toBe('Cargadores')
    expect(appLabel('file:vtbox.log')).toBe('Archivo vtbox.log')
    expect(appLabel('com.other')).toBe('com.other')
    expect(reportCode('0b9d6a7e-1c2f-4e3d-8a5b-9c0d1e2f3a4b')).toBe('0b9d6a7e')
    expect(membersLabel([])).toBe('')
    expect(membersLabel(['Ana'])).toBe('Ana')
    expect(membersLabel(['Ana', 'Beto', 'Caro'])).toBe('Ana, Beto y Caro')
    expect(vehicleFallbackLabel('5f1e2d3c-0000-4000-8000-000000000000')).toBe('Auto 5f1e2d3c')
  })
})
