import { describe, it, expect } from 'vitest'
import {
  CONNECTORS_BY_CURRENT,
  DEFAULT_CONNECTOR,
  NETWORK_LABELS,
  NETWORKS,
} from './stations'

describe('station catalogs (mirror DB constraints 0022/0023)', () => {
  it('pairs connectors with the right current type', () => {
    // AC-only connectors never appear under DC and vice versa.
    expect(CONNECTORS_BY_CURRENT.AC).toContain('Tipo 2')
    expect(CONNECTORS_BY_CURRENT.AC).toContain('Tipo 1')
    expect(CONNECTORS_BY_CURRENT.AC).toContain('Sin cable')
    expect(CONNECTORS_BY_CURRENT.AC).not.toContain('CCS2')
    expect(CONNECTORS_BY_CURRENT.AC).not.toContain('CCS1')

    expect(CONNECTORS_BY_CURRENT.DC).toContain('CCS2')
    expect(CONNECTORS_BY_CURRENT.DC).toContain('CCS1')
    expect(CONNECTORS_BY_CURRENT.DC).not.toContain('Tipo 2')
    expect(CONNECTORS_BY_CURRENT.DC).not.toContain('Tipo 1')
    expect(CONNECTORS_BY_CURRENT.DC).not.toContain('Sin cable')

    // GB/T and the escape hatch exist on both sides.
    expect(CONNECTORS_BY_CURRENT.AC).toContain('GB/T')
    expect(CONNECTORS_BY_CURRENT.DC).toContain('GB/T')
    expect(CONNECTORS_BY_CURRENT.AC).toContain('otro')
    expect(CONNECTORS_BY_CURRENT.DC).toContain('otro')
  })

  it('defaults are valid for their current type', () => {
    expect(CONNECTORS_BY_CURRENT.AC).toContain(DEFAULT_CONNECTOR.AC)
    expect(CONNECTORS_BY_CURRENT.DC).toContain(DEFAULT_CONNECTOR.DC)
  })

  it('lists the Argentina/Brazil networks for international trips', () => {
    expect(NETWORKS).toContain('ypf')
    expect(NETWORKS).toContain('tupinamba')
    expect(NETWORKS).toContain('zletric')
    expect(NETWORKS).toContain('edp')
    // Country is visible in the label so members pick the right one abroad.
    expect(NETWORK_LABELS.ypf).toContain('Argentina')
    expect(NETWORK_LABELS.tupinamba).toContain('Brasil')
    // 'otro' stays last as the escape hatch.
    expect(NETWORKS[NETWORKS.length - 1]).toBe('otro')
  })
})
