// The dashcam's 24-word recovery code, ported from vigo-hack
// dashcam/core/src/main/java/com/vigo/dashcam/core/recovery/RecoveryCode.java
// (specs/secret-vault.md R4). Layout: the 256 scalar bits (big endian) then an
// 8-bit checksum, cut into 24 groups of 11 bits (most significant first),
// each indexing RECOVERY_WORDS. Checksum = first byte of
// SHA-256("vigo-dashcam-recovery-v1" ‖ scalar). The checksum is a typo guard,
// not authentication (a random sequence passes with p = 1/256).
//
// Parsing is tolerant exactly like the Java side: lower case, any run of
// non-[a-z] separates words (spaces, commas, newlines, "7." numbering).
import { RECOVERY_WORDS } from './recoveryWords'
import { concatBytes, utf8 } from './encoding'

export const RECOVERY_WORD_COUNT = 24
export const RECOVERY_SECRET_BYTES = 32
/**
 * Prefixed text form the car's Dashcam used to show as a QR (removed 2026-11):
 * this prefix, then the 24 words joined by single spaces. Still accepted.
 */
export const DASHCAM_PAYLOAD_PREFIX = 'vigovault:dashcam:1:'
const PAYLOAD_SCHEME = 'vigovault:'
const DOMAIN = utf8('vigo-dashcam-recovery-v1')

let index: Map<string, number> | null = null
function wordIndex(): Map<string, number> {
  if (!index) index = new Map(RECOVERY_WORDS.map((w, i) => [w, i]))
  return index
}

export type RecoveryErrorKind = 'wrong_word_count' | 'unknown_word' | 'bad_checksum' | 'unsupported_payload'

export class RecoveryCodeError extends Error {
  readonly kind: RecoveryErrorKind
  /** 1-based word position for unknown_word, the word count for wrong_word_count, else 0. */
  readonly position: number
  constructor(kind: RecoveryErrorKind, position = 0) {
    // The message never echoes the words.
    super(`recovery code: ${kind}`)
    this.name = 'RecoveryCodeError'
    this.kind = kind
    this.position = position
  }
}

export function splitRecoveryWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0)
}

async function checksum(scalar: Uint8Array): Promise<number> {
  const digest = await crypto.subtle.digest('SHA-256', concatBytes(DOMAIN, scalar))
  return new Uint8Array(digest)[0]
}

/** Decodes 24 words to the 32-byte scalar; throws RecoveryCodeError. */
export async function decodeRecoveryWords(words: string[]): Promise<Uint8Array> {
  if (words.length !== RECOVERY_WORD_COUNT) throw new RecoveryCodeError('wrong_word_count', words.length)
  const all = new Uint8Array(RECOVERY_SECRET_BYTES + 1)
  const idx = wordIndex()
  for (let w = 0; w < RECOVERY_WORD_COUNT; w++) {
    const value = idx.get(words[w].toLowerCase())
    if (value === undefined) throw new RecoveryCodeError('unknown_word', w + 1)
    for (let b = 0; b < 11; b++) {
      const bit = w * 11 + b
      if ((value >> (10 - b)) & 1) all[bit >> 3] |= 1 << (7 - (bit & 7))
    }
  }
  const scalar = all.slice(0, RECOVERY_SECRET_BYTES)
  const ok = all[RECOVERY_SECRET_BYTES] === (await checksum(scalar))
  all.fill(0)
  if (!ok) {
    scalar.fill(0)
    throw new RecoveryCodeError('bad_checksum')
  }
  return scalar
}

/** The 24 words for a 32-byte scalar (used by the parity tests). */
export async function encodeRecoveryScalar(scalar: Uint8Array): Promise<string[]> {
  if (scalar.length !== RECOVERY_SECRET_BYTES) throw new Error('recovery secret must be 32 bytes')
  const all = new Uint8Array(RECOVERY_SECRET_BYTES + 1)
  all.set(scalar)
  all[RECOVERY_SECRET_BYTES] = await checksum(scalar)
  const words: string[] = []
  for (let w = 0; w < RECOVERY_WORD_COUNT; w++) {
    let value = 0
    for (let b = 0; b < 11; b++) {
      const bit = w * 11 + b
      value = (value << 1) | ((all[bit >> 3] >> (7 - (bit & 7))) & 1)
    }
    words.push(RECOVERY_WORDS[value])
  }
  return words
}

/**
 * Accepts what people type or paste (and what the car sends): the 24 words in
 * any layout, or the prefixed form `vigovault:dashcam:1:<words>`. Returns the
 * canonical form (24 lowercase words, single spaces) after the full check;
 * throws RecoveryCodeError otherwise.
 */
export async function canonicalRecoveryCode(input: string): Promise<string> {
  let text = input.trim()
  if (text.toLowerCase().startsWith(PAYLOAD_SCHEME)) {
    if (!text.toLowerCase().startsWith(DASHCAM_PAYLOAD_PREFIX))
      throw new RecoveryCodeError('unsupported_payload')
    text = text.slice(DASHCAM_PAYLOAD_PREFIX.length)
  }
  const words = splitRecoveryWords(text)
  const scalar = await decodeRecoveryWords(words)
  scalar.fill(0)
  return words.join(' ')
}

/** Spanish message for the page (never contains the words). */
export function recoveryErrorMessage(error: unknown): string {
  if (!(error instanceof RecoveryCodeError)) return 'No se pudo revisar la frase. Intentá de nuevo.'
  switch (error.kind) {
    case 'wrong_word_count':
      return error.position === 0
        ? 'Escribí las 24 palabras de la frase de recuperación.'
        : `La frase tiene 24 palabras y acá hay ${error.position}.`
    case 'unknown_word':
      return `La palabra ${error.position} no está en la lista de la dashcam. Revisá cómo está escrita.`
    case 'bad_checksum':
      return 'Las palabras no pasan el control: alguna está mal escrita o fuera de orden.'
    case 'unsupported_payload':
      return 'Ese código no es la frase de la dashcam (o es de una versión más nueva). Actualizá WikiVigo o escribí las 24 palabras.'
  }
}
