// Locale-aware formatting/parsing helpers for user-facing values.
// All user-visible output follows es-UY conventions.

// Uruguayan Spanish month abbreviations (note "set" for setiembre).
const MONTHS_ES_UY = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

/**
 * Formats an ISO `YYYY-MM-DD` date as "13 jul 2025", eliding the year when
 * it matches the current one ("13 jul"). Parses the parts by hand: passing
 * the string to `new Date()` would interpret it as UTC midnight and shift
 * the day in UY's UTC-3 timezone.
 */
export function formatDate(isoDate: string, now: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return isoDate
  const base = `${day} ${MONTHS_ES_UY[month - 1]}`
  return year === now.getFullYear() ? base : `${base} ${year}`
}

/**
 * Parses a number the way people type it here: accepts "28,5" (comma
 * decimal), "1.500,50" and "12.000" (dot thousands) alongside plain "28.5".
 * Returns `undefined` for blank input and `NaN` for garbage, so callers can
 * tell "not provided" apart from "invalid".
 */
export function parseLocaleNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(/\s+/g, '')
  if (!trimmed) return undefined
  let normalized = trimmed
  if (trimmed.includes(',')) {
    // Comma present: it's the decimal separator; any dots are thousands.
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    // Dot-grouped ("12.000", "1.500"): thousands separators, not decimals.
    normalized = trimmed.replace(/\./g, '')
  }
  return Number(normalized)
}
