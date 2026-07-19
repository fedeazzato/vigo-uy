import { describe, it, expect } from 'vitest'
import { toCsv } from './csvExport'

// toCsv is the public surface; escapeCsvValue is exercised through it.
function cell(value: string | number | null | undefined): string {
  return toCsv(['h'], [[value]]).split('\r\n')[1]
}

describe('toCsv', () => {
  it('joins rows with CRLF and cells with commas', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['1', '2'],
          ['3', '4'],
        ]
      )
    ).toBe('a,b\r\n1,2\r\n3,4')
  })

  it('quotes values containing commas, quotes and newlines', () => {
    expect(cell('a,b')).toBe('"a,b"')
    expect(cell('say "hi"')).toBe('"say ""hi"""')
    expect(cell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('renders null/undefined as empty cells', () => {
    expect(cell(null)).toBe('')
    expect(cell(undefined)).toBe('')
  })

  describe('formula-injection guard', () => {
    it.each(['=1+2', '+541234', '-cmd', '@SUM(A1)', '\tx', '\rx'])(
      'prefixes %j with a quote',
      (dangerous) => {
        expect(cell(dangerous)).toBe(`'${dangerous}`)
      }
    )

    it('does not prefix negative numbers that arrive as number type', () => {
      expect(cell(-500)).toBe('-500')
      expect(cell(-0.5)).toBe('-0.5')
    })

    it('still applies quote-wrapping after the prefix', () => {
      expect(cell('=1,2')).toBe('"\'=1,2"')
    })

    it('leaves plain text untouched', () => {
      expect(cell('service de 15.000 km')).toBe('service de 15.000 km')
      expect(cell(12000)).toBe('12000')
    })
  })
})
