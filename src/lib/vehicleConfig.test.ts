import { describe, expect, it } from 'vitest'
import { diffSnapshots, parseConfigFile } from './vehicleConfig'

const FILE = [
  'vigo-vehicle-config 1',
  'label=antes_del_service',
  'taken=2026-11-23T10:00:00Z',
  'firmware=DFRD_S32O_MPU_V01811_20250814_128G',
  'head=1-2-3-4-5-6-7-8-9-10-11-12',
  'tail=13-14-15-16-17-18-19-20-21-22-23-24',
  'item119=1',
  'item134=6',
  'item161=0',
  'gps_source=1',
].join('\r\n')

describe('vehicleConfig', () => {
  it('parses the installer file', () => {
    const s = parseConfigFile(FILE)!
    expect(s.label).toBe('antes_del_service')
    expect(s.taken_at).toBe('2026-11-23T10:00:00.000Z')
    expect(s.items).toEqual({ item119: 1, item134: 6, item161: 0, gps_source: '1' })
    expect(s.config_tail).toBe('13-14-15-16-17-18-19-20-21-22-23-24')
  })

  it('refuses other files and bad bytes', () => {
    expect(parseConfigFile('hello')).toBeNull()
    expect(parseConfigFile('vigo-vehicle-config 1\nhead=1-2-x')).toBeNull()
    expect(parseConfigFile('vigo-vehicle-config 1\ntail=1')).toBeNull()
  })

  it('unknown label becomes manual; junk item values are dropped', () => {
    const s = parseConfigFile('vigo-vehicle-config 1\nlabel=hack\nhead=1-2\nitem134=<b>')!
    expect(s.label).toBe('manual')
    expect(s.items).toEqual({})
  })

  it('diff names the market change and the byte', () => {
    const a = parseConfigFile(FILE)!
    const b = parseConfigFile(
      FILE.replace('item134=6', 'item134=2').replace(
        'tail=13-14-15-16-17-18-19-20',
        'tail=13-14-15-16-17-18-19-21'
      )
    )!
    const d = diffSnapshots(a, b)
    expect(d).toContainEqual({ what: 'Mercado (ítem 134)', before: '6', after: '2' })
    expect(d).toContainEqual({ what: 'Byte 19', before: '20', after: '21' })
    expect(diffSnapshots(a, a)).toEqual([])
  })
})
