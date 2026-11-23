// @vitest-environment node
// specs/car-updates.md: manifest reading, the Java-made signature vector (SignManifest.java, DER), notices.
import { describe, it, expect } from 'vitest'
import {
  countPhases,
  derToP1363,
  effectivePercent,
  parseManifest,
  pendingNotices,
  verifyManifestSignature,
} from './carReleases'

// Made with vigo-hack updater/tools/SignManifest.java and a throwaway key (deleted): DER signature, base64.
const TEST_KEY =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEyEg/36v6Et+Jhju1YUISF8fYbWf0OZszvsNtlDIuMrRAbKcrok3Ng6TatbY2VnmRkQEEA1POmFJLVZ231oHe9Q=='
const TEST_SIG =
  'MEUCIBaZlniUZiyGYNNtXklaEgk8jhtS33LlfpHGpALT7AQqAiEA7kve5G7nW/ch90dDvco4U0XFeYudwls2SZlf1ysXtsU='
const MANIFEST =
  'vigo-update 1\nserial 42\nissued 1795000000\nexpires 1797600000\nkill 0\nrollout 25 r42\n' +
  'app com.vigo.carga 7 0.7 app/Carga\n' +
  `file Carga.apk 1234567 ${'a'.repeat(64)} Carga-0.7.apk\n` +
  'notice com.waze 1061234 Waze_5.30\nend\n'

describe('parseManifest', () => {
  it('reads the header, apps and notices', () => {
    const r = parseManifest(MANIFEST)
    expect('summary' in r).toBe(true)
    if (!('summary' in r)) return
    expect(r.summary.serial).toBe(42)
    expect(r.summary.kill).toBe(false)
    expect(r.summary.rolloutPercent).toBe(25)
    expect(r.summary.rolloutSalt).toBe('r42')
    expect(r.summary.apps[0]).toMatchObject({ pkg: 'com.vigo.carga', versionCode: 7, versionName: '0.7' })
    expect(r.summary.apps[0].files[0].blob).toBe('Carga-0.7.apk')
    expect(r.summary.notices).toEqual([{ pkg: 'com.waze', versionCode: 1061234, label: 'Waze 5.30' }])
  })

  it.each([
    ['CRLF', MANIFEST.replace(/\n/g, '\r\n')],
    ['no header', MANIFEST.replace('vigo-update 1\n', '')],
    ['no end', MANIFEST.replace('end\n', '')],
    ['unknown record', MANIFEST.replace('kill 0\n', 'kill 0\nfoo 1\n')],
    ['missing rollout', MANIFEST.replace('rollout 25 r42\n', '')],
    ['file before app', MANIFEST.replace('app com.vigo.carga 7 0.7 app/Carga\n', '')],
  ])('refuses %s', (_n, text) => {
    expect('error' in parseManifest(text)).toBe(true)
  })
})

describe('verifyManifestSignature', () => {
  it('accepts the Java-made signature of the exact bytes', async () => {
    expect(await verifyManifestSignature(MANIFEST, TEST_SIG, [TEST_KEY])).toBe(true)
  })

  it('refuses a one-character change, a wrong key and garbage', async () => {
    expect(
      await verifyManifestSignature(MANIFEST.replace('rollout 25', 'rollout 26'), TEST_SIG, [TEST_KEY])
    ).toBe(false)
    expect(await verifyManifestSignature(MANIFEST, TEST_SIG)).toBe(false) // not signed by the trusted keys
    expect(await verifyManifestSignature(MANIFEST, 'not base64!', [TEST_KEY])).toBe(false)
  })

  it('derToP1363 refuses malformed DER', () => {
    expect(derToP1363(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(derToP1363(new Uint8Array([0x30, 6, 0x02, 1, 1, 0x02, 1, 1, 9]))).toBeNull()
    expect(derToP1363(new Uint8Array([0x30, 6, 0x02, 1, 1, 0x02, 1, 1]))?.length).toBe(64)
  })
})

describe('rollout, phases and notices', () => {
  it('caps never raise the signed percent', () => {
    expect(effectivePercent({ rollout_percent: 25, rollout_cap: null })).toBe(25)
    expect(effectivePercent({ rollout_percent: 25, rollout_cap: 0 })).toBe(0)
    expect(effectivePercent({ rollout_percent: 25, rollout_cap: 80 })).toBe(25)
  })

  it('counts phases in Spanish', () => {
    expect(countPhases([{ phase: 'IDLE' }, { phase: 'IDLE' }, { phase: null }])).toEqual({
      'Al día': 2,
      'Sin datos': 1,
    })
  })

  it('shows a notice only when the car has an older version (or none reported)', () => {
    const n = [
      { package: 'com.waze', version_code: 100, label: 'Waze 5' },
      { package: 'com.google.android.gms', version_code: 200, label: 'GMS' },
    ]
    expect(
      pendingNotices(n, { 'com.waze': 100, 'com.google.android.gms': 150 }).map((x) => x.package)
    ).toEqual(['com.google.android.gms'])
    expect(pendingNotices(n, {})).toHaveLength(2)
  })
})
