// specs/licences-and-sources.md
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import LicencesPage from './LicencesPage'
import rawData from '../data/licences.json'
import type { LicencesData } from '../types'

const data = rawData as LicencesData
const all = data.groups.flatMap((g) => g.components)

describe('LicencesPage', () => {
  it('every component has a version, a licence, https links and a changes note', () => {
    expect(all.length).toBeGreaterThan(10)
    for (const c of all) {
      expect(c.version, c.name).not.toBe('')
      expect(c.licence, c.name).not.toBe('')
      expect(c.changes, c.name).not.toBe('')
      expect(c.licenceUrl, c.name).toMatch(/^https:\/\//)
      expect(c.sourceUrl, c.name).toMatch(/^https:\/\//)
    }
  })

  it('covers the GPL and Open RAIL-M parts the distribution plan requires', () => {
    expect(all.some((c) => c.gpl && c.name.includes('eSpeak NG'))).toBe(true)
    expect(all.some((c) => c.sourceUrl.includes('sherpa-onnx/tree/v1.13.8'))).toBe(true)
    expect(all.some((c) => c.restrictions && c.name.includes('Supertonic 2'))).toBe(true)
    for (const name of ['Vosk', 'JNA', 'Open Charge Map', 'OpenStreetMap', 'Platform-Tools', 'Waze']) {
      expect(all.some((c) => c.name.includes(name)), name).toBe(true)
    }
  })

  it('renders the source offer, the use restrictions and the MIT own-code licence', () => {
    render(
      <MemoryRouter>
        <LicencesPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Oferta de código fuente/)).toBeTruthy()
    expect(screen.getByText(/restricciones de uso \(Open RAIL-M\)/)).toBeTruthy()
    expect(screen.getByText(/apps para el auto y del instalador también tiene licencia MIT/)).toBeTruthy()
    expect(screen.getAllByText('texto de la licencia')).toHaveLength(all.length)
  })
})
