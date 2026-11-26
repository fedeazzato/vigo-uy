import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InstallerFeaturesPage from './InstallerFeaturesPage'
import { installerFeatures } from '../lib/installerFeatures'

function renderPage() {
  return render(
    <MemoryRouter>
      <InstallerFeaturesPage />
    </MemoryRouter>
  )
}

describe('InstallerFeaturesPage (specs/installer-features-page.md)', () => {
  it('renders every group and one card per feature with where-to-find and a photo slot', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /Qué agrega el instalador a tu Vigo/ })).toBeTruthy()
    for (const g of installerFeatures.groups) {
      const section = screen.getByRole('region', { name: g.title })
      for (const f of g.features) {
        const card = within(section).getByRole('heading', { level: 3, name: f.name })
          .parentElement as HTMLElement
        expect(within(card).getByText(f.benefit)).toBeTruthy()
        expect(within(card).getByText(/Dónde lo encontrás/)).toBeTruthy()
        expect(within(card).getByText(`Foto (próximamente): ${f.photo}`)).toBeTruthy()
      }
    }
  })

  it('has the third-party apps group and labels what the public installer does not bring yet', () => {
    renderPage()
    const apps = screen.getByRole('region', { name: 'Apps que se suman' })
    for (const n of ['Waze', 'YouTube y Chrome', 'Spotify'])
      expect(within(apps).getByRole('heading', { name: n })).toBeTruthy()
    const waze = within(apps).getByRole('heading', { name: 'Waze' }).parentElement as HTMLElement
    expect(within(waze).getByText('Todavía no en el instalador')).toBeTruthy()
    expect(screen.getByText(/Se están probando/)).toBeTruthy()
  })

  it('never lists the owner-only engine sound', () => {
    const { container } = renderPage()
    expect(container.textContent).not.toMatch(/AVAS|Mustang|V8/)
  })

  it('every feature has the fields the page shows, and unique ids', () => {
    const all = [...installerFeatures.groups.flatMap((g) => g.features), ...installerFeatures.testing]
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length)
    for (const f of all)
      for (const k of ['name', 'benefit', 'where', 'photo'] as const) expect(f[k].length).toBeGreaterThan(0)
    for (const f of installerFeatures.testing) expect(f.status).toBe('enPrueba')
  })

  it('explains what can be undone, what you need, and links Preparar mi Vigo', () => {
    renderPage()
    expect(screen.getByText(/Qué no cambia y qué podés deshacer/)).toBeTruthy()
    expect(screen.getByText(/«Quitar todo»/)).toBeTruthy()
    expect(screen.getByText('Unos 20 minutos.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Preparar mi Vigo' }).getAttribute('href')).toBe(
      '/mi-vigo/preparar'
    )
  })
})
