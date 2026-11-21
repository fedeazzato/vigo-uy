import { describe, expect, it } from 'vitest'
import { MASTER_CODE, factoryCode, isValidPdsn, normalizePdsn } from './vigoPass'

// Vectors from made-up serials, computed with vigo-hack/vigo_pass.ts (the version verified on a real car).
describe('vigoPass', () => {
  it('computes the Factory code like vigo_pass.ts', async () => {
    expect(await factoryCode('TESTPDSN0000000001')).toBe('DfCs250d52d0#!')
    expect(await factoryCode('ABC')).toBe('DfCs15423203#!')
  })

  it('ignores whitespace after normalization', async () => {
    expect(await factoryCode(normalizePdsn('  TESTPDSN 0000 000001 \n'))).toBe('DfCs250d52d0#!')
  })

  it('keeps the case (the hash uses the exact characters)', () => {
    expect(normalizePdsn('ab Cd')).toBe('abCd')
  })

  it('validates the PDSN', () => {
    expect(isValidPdsn('TESTPDSN0000000001')).toBe(true)
    expect(isValidPdsn('ABC12')).toBe(false)
    expect(isValidPdsn('TEST-PDSN-0001')).toBe(false)
    expect(isValidPdsn('')).toBe(false)
  })

  it('has the fixed Master code', () => {
    expect(MASTER_CODE).toBe('DfCs0715#!')
  })
})
