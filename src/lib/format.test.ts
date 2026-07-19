import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, parseLocaleNumber } from './format'

describe('formatDate', () => {
  const now = new Date(2026, 6, 13) // 13 jul 2026

  it('elides the year when it matches the current one', () => {
    expect(formatDate('2026-07-13', now)).toBe('13 jul')
    expect(formatDate('2026-01-02', now)).toBe('2 ene')
  })

  it('shows the year when it differs', () => {
    expect(formatDate('2025-09-05', now)).toBe('5 set 2025')
    expect(formatDate('2027-12-31', now)).toBe('31 dic 2027')
  })

  it('returns unrecognized input untouched', () => {
    expect(formatDate('', now)).toBe('')
    expect(formatDate('2026-13-01', now)).toBe('2026-13-01')
    expect(formatDate('13/07/2026', now)).toBe('13/07/2026')
  })
})

describe('formatCurrency', () => {
  it('formats whole pesos with es-UY grouping by default', () => {
    expect(formatCurrency(1500)).toBe('$1.500')
    expect(formatCurrency(0)).toBe('$0')
    expect(formatCurrency(12000.4)).toBe('$12.000')
  })

  it('rounds to the requested fraction digits', () => {
    expect(formatCurrency(1234.5)).toBe('$1.235')
    expect(formatCurrency(1500.5, 2)).toBe('$1.500,50')
    expect(formatCurrency(89.9, 2)).toBe('$89,90')
  })
})

describe('parseLocaleNumber', () => {
  it('parses comma as decimal separator', () => {
    expect(parseLocaleNumber('28,5')).toBe(28.5)
    expect(parseLocaleNumber('0,25')).toBe(0.25)
  })

  it('parses dot thousands, with and without comma decimals', () => {
    expect(parseLocaleNumber('1.500,50')).toBe(1500.5)
    expect(parseLocaleNumber('12.000')).toBe(12000)
    expect(parseLocaleNumber('1.500')).toBe(1500)
    expect(parseLocaleNumber('1.234.567')).toBe(1234567)
  })

  it('parses plain dot decimals and integers', () => {
    expect(parseLocaleNumber('28.5')).toBe(28.5)
    expect(parseLocaleNumber('140')).toBe(140)
    expect(parseLocaleNumber(' 90 ')).toBe(90)
  })

  it('returns undefined for blank and NaN for garbage', () => {
    expect(parseLocaleNumber('')).toBeUndefined()
    expect(parseLocaleNumber('   ')).toBeUndefined()
    expect(parseLocaleNumber('abc')).toBeNaN()
    expect(parseLocaleNumber('1,2,3')).toBeNaN()
  })
})
