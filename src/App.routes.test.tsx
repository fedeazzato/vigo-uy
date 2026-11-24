// Site structure (owner decisions 2026-11-24 #1, #5, #6): old routes redirect to the new tabs / pages.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import RedirectKeepState from './components/RedirectKeepState'
import { PRIMARY_NAV } from './lib/primaryNav'
import { GUIDE_GROUPS, GUIDE_LINKS } from './components/GuideLinks'

vi.mock('./lib/supabaseClient', () => ({ supabase: null }))

function Where() {
  const l = useLocation()
  return <p>at {l.pathname} {JSON.stringify(l.state)}</p>
}

describe('site structure', () => {
  it('/mi-actividad goes to Mi Vigo › Mis registros keeping the saved toast state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/mi-actividad', state: { saved: 'viaje' } }]}>
        <Routes>
          <Route path="/mi-actividad" element={<RedirectKeepState to="/mi-vigo/registros" />} />
          <Route path="/mi-vigo/registros" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('at /mi-vigo/registros {"saved":"viaje"}')).toBeTruthy()
  })

  it('old Guía and care routes point at the new pages', () => {
    render(
      <MemoryRouter initialEntries={['/repuestos']}>
        <Routes>
          <Route path="/repuestos" element={<Navigate to="/cuidar/repuestos" replace />} />
          <Route path="/cuidar/repuestos" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/at \/cuidar\/repuestos/)).toBeTruthy()
  })

  it('primary nav: Inicio, Aprender, Comunidad, Mi Vigo (no Mi actividad, no Guía)', () => {
    expect(PRIMARY_NAV.map((n) => n.label)).toEqual(['Inicio', 'Aprender', 'Comunidad', 'Mi Vigo'])
  })

  it('Aprender has the three groups and every link belongs to one', () => {
    expect(GUIDE_GROUPS.map((g) => g.label)).toEqual(['Cargar y viajar', 'Costos y mantenimiento', 'Conocé tu Vigo'])
    for (const l of GUIDE_LINKS) expect(GUIDE_GROUPS.some((g) => g.id === l.group)).toBe(true)
    expect(GUIDE_LINKS.some((l) => l.to === '/aprender/glosario')).toBe(true)
    expect(GUIDE_LINKS.some((l) => l.label === 'Cuidar tu Vigo')).toBe(true)
  })
})
