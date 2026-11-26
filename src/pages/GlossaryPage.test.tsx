import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import GlossaryPage from './GlossaryPage'
import { GLOSSARY, glossaryPath } from '../lib/glossary'

describe('GlossaryPage', () => {
  it('lists every term, highlights ?t=', () => {
    render(
      <MemoryRouter initialEntries={[glossaryPath('vin')]}>
        <Routes>
          <Route path="/aprender/glosario" element={<GlossaryPage />} />
        </Routes>
      </MemoryRouter>
    )
    for (const t of GLOSSARY) expect(screen.getByText(t.word)).toBeTruthy()
    expect(document.getElementById('termino-vin')?.className).toMatch(/target/)
  })

  it('covers the words the owner asked for, with unique ids', () => {
    const ids = GLOSSARY.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['kwh', 'kwh-100', 'vin', 'adb', 'llave-de-acceso', 'oficial', 'aforo', 'deducible']) {
      expect(ids).toContain(id)
    }
  })
})
