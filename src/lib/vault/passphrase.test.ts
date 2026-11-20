import { describe, it, expect, vi } from 'vitest'
import { PASSPHRASE_WORD_COUNT, generatePassphrase, passphraseError } from './passphrase'
import { RECOVERY_WORDS } from './recoveryWords'

describe('generatePassphrase', () => {
  it('joins 10 list words with hyphens', () => {
    const p = generatePassphrase()
    const words = p.split('-')
    expect(words).toHaveLength(PASSPHRASE_WORD_COUNT)
    expect(words.every((w) => RECOVERY_WORDS.includes(w))).toBe(true)
    expect(p).toMatch(/^[a-z-]+$/)
    expect(passphraseError(p)).toBeNull()
  })

  it('differs between calls (CSPRNG)', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassphrase()))
    expect(seen.size).toBe(50)
  })

  it('uses getRandomValues and masks to 11 bits', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues')
    generatePassphrase()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    const p = generatePassphrase((a) => a.fill(0xffff))
    expect(p.split('-').every((w) => w === RECOVERY_WORDS[2047])).toBe(true)
    expect(generatePassphrase((a) => a.fill(0x0800)).split('-')[0]).toBe(RECOVERY_WORDS[0])
  })
})

describe('passphraseError', () => {
  it('enforces sb_crypto.ps1 minimum and the vault maximum', () => {
    expect(passphraseError('1234567')).toMatch(/al menos 8/)
    expect(passphraseError('12345678')).toBeNull()
    expect(passphraseError('x'.repeat(200))).toBeNull()
    expect(passphraseError('x'.repeat(201))).toMatch(/hasta 200/)
  })

  it('refuses control characters', () => {
    expect(passphraseError('abcd\nefgh')).toMatch(/control/)
    expect(passphraseError('abcd\tefgh')).toMatch(/control/)
  })
})
