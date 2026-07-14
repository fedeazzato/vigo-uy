import { describe, it, expect } from 'vitest'
import { CONNECTORS_BY_CURRENT, DEFAULT_CONNECTOR } from './stations'

// Networks themselves live in the charging_networks table since 0024 — only
// the physical connector/current pairing stays hardcoded (and DB-enforced).
describe('station catalogs (mirror DB constraint 0025)', () => {
  it('pairs connectors with the right current type', () => {
    // AC-only connectors never appear under DC and vice versa.
    expect(CONNECTORS_BY_CURRENT.AC).toContain('Tipo 2')
    expect(CONNECTORS_BY_CURRENT.AC).toContain('Tipo 1')
    expect(CONNECTORS_BY_CURRENT.AC).not.toContain('CCS2')
    expect(CONNECTORS_BY_CURRENT.AC).not.toContain('CCS1')

    expect(CONNECTORS_BY_CURRENT.DC).toContain('CCS2')
    expect(CONNECTORS_BY_CURRENT.DC).toContain('CCS1')
    expect(CONNECTORS_BY_CURRENT.DC).not.toContain('Tipo 2')
    expect(CONNECTORS_BY_CURRENT.DC).not.toContain('Tipo 1')

    // GB/T and Sin cable exist on both sides; 'otro' is gone.
    expect(CONNECTORS_BY_CURRENT.AC).toContain('GB/T')
    expect(CONNECTORS_BY_CURRENT.DC).toContain('GB/T')
    expect(CONNECTORS_BY_CURRENT.AC).toContain('Sin cable')
    expect(CONNECTORS_BY_CURRENT.DC).toContain('Sin cable')
    expect(CONNECTORS_BY_CURRENT.AC).not.toContain('otro')
    expect(CONNECTORS_BY_CURRENT.DC).not.toContain('otro')
  })

  it('defaults are valid for their current type', () => {
    expect(CONNECTORS_BY_CURRENT.AC).toContain(DEFAULT_CONNECTOR.AC)
    expect(CONNECTORS_BY_CURRENT.DC).toContain(DEFAULT_CONNECTOR.DC)
  })
})
