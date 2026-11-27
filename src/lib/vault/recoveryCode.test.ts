// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { RECOVERY_WORDS } from './recoveryWords'
import {
  DASHCAM_PAYLOAD_PREFIX,
  RecoveryCodeError,
  canonicalRecoveryCode,
  decodeRecoveryWords,
  encodeRecoveryScalar,
  recoveryErrorMessage,
  splitRecoveryWords,
} from './recoveryCode'
import { GOLDEN_WORDLIST_SHA256, RECOVERY_VECTORS, SAMPLE_PAYLOAD } from './testVectors'
import { bytesToHex, utf8 } from './encoding'

async function errorOf(text: string): Promise<RecoveryCodeError> {
  try {
    await canonicalRecoveryCode(text)
  } catch (e) {
    if (e instanceof RecoveryCodeError) return e
    throw e
  }
  throw new Error('expected a RecoveryCodeError')
}

describe('recovery word list (parity with the dashcam WordList)', () => {
  it('matches the dashcam golden SHA-256', async () => {
    const digest = await crypto.subtle.digest('SHA-256', utf8(RECOVERY_WORDS.join('\n') + '\n'))
    expect(bytesToHex(new Uint8Array(digest))).toBe(GOLDEN_WORDLIST_SHA256)
  })

  it('has 2048 sorted, distinct, 4-5 letter words with unique 4-letter prefixes', () => {
    expect(RECOVERY_WORDS).toHaveLength(2048)
    expect(new Set(RECOVERY_WORDS).size).toBe(2048)
    expect(new Set(RECOVERY_WORDS.map((w) => w.slice(0, 4))).size).toBe(2048)
    expect(RECOVERY_WORDS.every((w) => /^[a-z]{4,5}$/.test(w))).toBe(true)
    expect([...RECOVERY_WORDS].sort()).toEqual(RECOVERY_WORDS)
  })
})

describe('shared vectors', () => {
  it.each(RECOVERY_VECTORS.map((v, i) => [i + 1, v] as const))(
    'vector %i decodes and encodes',
    async (_n, v) => {
      const scalar = await decodeRecoveryWords(v.words.split(' '))
      expect(bytesToHex(scalar)).toBe(v.scalarHex)
      const words = await encodeRecoveryScalar(scalar)
      expect(words.join(' ')).toBe(v.words)
      expect(await canonicalRecoveryCode(DASHCAM_PAYLOAD_PREFIX + v.words)).toBe(v.words)
    }
  )

  it('the car payload is at most 163 bytes', () => {
    const longest = Array(24).fill('zuzuf').join(' ')
    expect((DASHCAM_PAYLOAD_PREFIX + longest).length).toBe(163)
    expect(SAMPLE_PAYLOAD.startsWith('vigovault:dashcam:1:')).toBe(true)
  })

  it('round-trips random scalars', async () => {
    for (let i = 0; i < 200; i++) {
      const scalar = crypto.getRandomValues(new Uint8Array(32))
      const words = await encodeRecoveryScalar(scalar)
      expect(bytesToHex(await decodeRecoveryWords(words))).toBe(bytesToHex(scalar))
    }
  })
})

describe('tolerant parsing (same as RecoveryCode.decode(String))', () => {
  const words = RECOVERY_VECTORS[4].words

  it('accepts upper case, extra spaces, commas, newlines, numbering and hyphens', async () => {
    const list = words.split(' ')
    expect(await canonicalRecoveryCode(words.toUpperCase())).toBe(words)
    expect(await canonicalRecoveryCode(`   ${words.replace(/ /g, '  \t ')}  \n`)).toBe(words)
    expect(await canonicalRecoveryCode(words.replace(/ /g, ',\r\n'))).toBe(words)
    expect(await canonicalRecoveryCode(list.map((w, i) => `${i + 1}. ${w}`).join('\n'))).toBe(words)
    expect(await canonicalRecoveryCode(words.replace(/ /g, '-'))).toBe(words)
  })

  it('accepts the payload with surrounding whitespace or an upper-case scheme', async () => {
    expect(await canonicalRecoveryCode(`  ${SAMPLE_PAYLOAD}\n`)).toBe(RECOVERY_VECTORS[3].words)
    expect(await canonicalRecoveryCode(SAMPLE_PAYLOAD.replace('vigovault', 'VIGOVAULT'))).toBe(
      RECOVERY_VECTORS[3].words
    )
  })

  it('splits like the Java regex', () => {
    expect(splitRecoveryWords(' 1) Babad, 2) baded\n')).toEqual(['babad', 'baded'])
    expect(splitRecoveryWords('')).toEqual([])
  })
})

describe('errors', () => {
  const list = RECOVERY_VECTORS[5].words.split(' ')

  it('wrong word count', async () => {
    expect((await errorOf('   ')).kind).toBe('wrong_word_count')
    const e = await errorOf(list.slice(0, 23).join(' '))
    expect(e.kind).toBe('wrong_word_count')
    expect(e.position).toBe(23)
    expect((await errorOf([...list, list[0]].join(' '))).kind).toBe('wrong_word_count')
  })

  it('unknown word with its 1-based position', async () => {
    const bad = [...list]
    bad[6] = 'xyzzy'
    const e = await errorOf(bad.join(' '))
    expect(e.kind).toBe('unknown_word')
    expect(e.position).toBe(7)
  })

  it('swapped words fail the checksum', async () => {
    const swapped = [...list]
    ;[swapped[3], swapped[9]] = [swapped[9], swapped[3]]
    expect((await errorOf(swapped.join(' '))).kind).toBe('bad_checksum')
  })

  it('other payload versions or kinds are refused', async () => {
    expect((await errorOf(`vigovault:dashcam:2:${list.join(' ')}`)).kind).toBe('unsupported_payload')
    expect((await errorOf(`vigovault:other:1:${list.join(' ')}`)).kind).toBe('unsupported_payload')
  })

  it('messages are Spanish and never echo the words', async () => {
    const bad = [...list]
    bad[0] = 'xyzzy'
    for (const text of [bad.join(' '), list.slice(0, 20).join(' '), [...list].reverse().join(' ')]) {
      const e = await errorOf(text)
      const message = recoveryErrorMessage(e)
      const shown = new Set([...splitRecoveryWords(message), ...splitRecoveryWords(e.message)])
      for (const w of [...list, 'xyzzy']) expect(shown.has(w)).toBe(false)
    }
    expect(recoveryErrorMessage(await errorOf(list.slice(0, 20).join(' ')))).toBe(
      'La frase tiene 24 palabras y acá hay 20.'
    )
    expect(recoveryErrorMessage(new Error('x'))).toMatch(/No se pudo revisar/)
  })
})
