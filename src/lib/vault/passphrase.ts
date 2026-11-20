// The settings-backup passphrase (vigo-hack settings_backup/sb_crypto.ps1:
// PBKDF2-HMAC-SHA256, 600 000 iterations, at least 8 characters).
// specs/secret-vault.md R5.
import { RECOVERY_WORDS } from './recoveryWords'

export const PASSPHRASE_WORD_COUNT = 10
export const PASSPHRASE_MIN_LENGTH = 8
export const PASSPHRASE_MAX_LENGTH = 200

/**
 * 10 words from the dashcam's 2048-word list (11 bits each = 110 bits),
 * joined by '-': lowercase ASCII, easy to type at backup_car.ps1's prompt.
 * 2048 is a power of two, so masking a random 16-bit value has no bias.
 */
export function generatePassphrase(
  fillRandom: (array: Uint16Array<ArrayBuffer>) => Uint16Array<ArrayBuffer> = (a) => crypto.getRandomValues(a)
): string {
  const values = fillRandom(new Uint16Array(PASSPHRASE_WORD_COUNT))
  const words = Array.from(values, (v) => RECOVERY_WORDS[v & 0x7ff])
  values.fill(0)
  return words.join('-')
}

/** Spanish error, or null when the passphrase can be kept. */
export function passphraseError(value: string): string | null {
  if (value.length < PASSPHRASE_MIN_LENGTH)
    return `La clave tiene que tener al menos ${PASSPHRASE_MIN_LENGTH} caracteres (lo mismo que pide backup_car.ps1).`
  if (value.length > PASSPHRASE_MAX_LENGTH)
    return `La clave puede tener hasta ${PASSPHRASE_MAX_LENGTH} caracteres.`
  if (/[\u0000-\u001f\u007f]/.test(value))
    return 'La clave no puede tener saltos de línea ni caracteres de control.'
  return null
}
