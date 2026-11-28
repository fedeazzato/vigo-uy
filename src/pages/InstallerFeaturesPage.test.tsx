import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import InstallerFeaturesPage from './InstallerFeaturesPage'
import { installerFeatures } from '../lib/installerFeatures'
import type { CarBetaState } from '../lib/carBeta'

// The page is gated (beta testers + moderators): tests run as a moderator unless they set another user.
const mocks = vi.hoisted(() => ({
  auth: {},
  fetchCarBeta: vi.fn<() => Promise<CarBetaState | null>>(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../lib/carBeta', () => ({ fetchCarBeta: mocks.fetchCarBeta }))

function signedIn(isModerator: boolean) {
  return { user: { id: 'user-1' }, profile: { id: 'user-1', is_moderator: isModerator }, status: 'signedIn' }
}

beforeEach(() => {
  mocks.auth = signedIn(true)
  mocks.fetchCarBeta.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <InstallerFeaturesPage />
    </MemoryRouter>
  )
}

describe('InstallerFeaturesPage (specs/installer-features-page.md)', () => {
  it('renders every group and one card per feature with where-to-find and its screenshots or a photo slot', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /Qué agrega el instalador a tu Vigo/ })).toBeTruthy()
    for (const g of installerFeatures.groups) {
      const section = screen.getByRole('region', { name: g.title })
      for (const f of g.features) {
        const card = within(section).getByRole('heading', { level: 3, name: f.name })
          .parentElement as HTMLElement
        expect(within(card).getByText(f.benefit)).toBeTruthy()
        expect(within(card).getByText(/Dónde lo encontrás/)).toBeTruthy()
        if (f.shots) {
          for (const s of f.shots)
            expect(within(card).getByRole('img', { name: s.alt }).getAttribute('src')).toContain(s.src)
          expect(within(card).queryByText(/Foto \(próximamente\)/)).toBeNull()
        } else expect(within(card).getByText(`Foto (próximamente): ${f.photo}`)).toBeTruthy()
      }
    }
  })

  it('opens a screenshot large on this page (no new tab) and closes it again', () => {
    renderPage()
    expect(document.querySelector('a[target="_blank"] img')).toBeNull()
    const shot = installerFeatures.groups.flatMap((g) => g.features.flatMap((f) => f.shots ?? []))[0]
    const thumb = screen.getByRole('img', { name: shot.alt }).closest('button') as HTMLButtonElement
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(thumb)
    const dialog = screen.getByRole('dialog', { name: shot.alt })
    const zoom = within(dialog).getByRole('button', { name: 'Agrandar' })
    fireEvent.click(zoom)
    expect(zoom.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar imagen' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(thumb)
    expect(screen.getByRole('button', { name: 'Agrandar' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ships every screenshot it names', () => {
    const shots = installerFeatures.groups.flatMap((g) => g.features.flatMap((f) => f.shots ?? []))
    expect(shots.length).toBeGreaterThan(0)
    const files = Object.keys(import.meta.glob('../../public/installer/*.jpg'))
    for (const s of shots) expect(files, s.src).toContain(`../../public/${s.src}`)
  })

  it('names benefits, not internals: the merged and renamed cards are there, the removed ones are not', () => {
    const { container } = renderPage()
    const card = (n: string) =>
      screen.getByRole('heading', { level: 3, name: n }).parentElement as HTMLElement
    for (const n of [
      'Modo invitado',
      'Copiloto: le hablás en español',
      'Centro de Energía inteligente',
      'Android Auto sin cable',
      'Actualizaciones remotas',
      'Tus fotos, en el auto y de fondo',
    ])
      expect(card(n)).toBeTruthy()
    for (const n of [
      'Servicios de Google Play',
      'Voz en español',
      'Botón de voz del volante',
      'Carga, dentro de Energía',
      'Cargadores cercanos',
      'Avisos de software de Google',
      'Tus fotos de fondo',
      'Pantalla de inicio ordenada',
      'Enviar diagnóstico',
    ])
      expect(screen.queryByRole('heading', { name: n })).toBeNull()
    expect(container.textContent).not.toMatch(/Open Headunit|Wi-Fi Direct/)
    // The steering-wheel key survives only as a phrase inside Copiloto; Google sign-in inside Waze.
    expect(within(card('Copiloto: le hablás en español')).getByText(/botón de voz del volante/)).toBeTruthy()
    expect(within(card('Waze')).getAllByText(/cuenta de Google/).length).toBeGreaterThan(0)
  })

  it('Modo invitado is the highlighted first card, with the PIN and WikiVigo on the phone', () => {
    renderPage()
    const first = screen.getAllByRole('heading', { level: 3 })[0]
    expect(first.textContent).toBe('Modo invitado')
    const card = first.parentElement as HTMLElement
    expect(card.className).toMatch(/highlight/)
    expect(within(card).getByText(/lavadero o en un estacionamiento/)).toBeTruthy()
    expect(within(card).getByText(/tu PIN/)).toBeTruthy()
    expect(within(card).getByText(/WikiVigo en tu celular/)).toBeTruthy()
    const all = installerFeatures.groups.flatMap((g) => g.features)
    expect(all.filter((f) => f.highlight).map((f) => f.id)).toEqual(['modo-invitado'])
  })

  it('badges only where meaningful: YouTube y Chrome optional, the rest none', () => {
    renderPage()
    const card = (n: string) =>
      screen.getByRole('heading', { level: 3, name: n }).parentElement as HTMLElement
    expect(within(card('YouTube y Chrome')).getByText('Opcional')).toBeTruthy()
    for (const n of [
      'Waze',
      'Spotify y TikTok',
      'Android Auto sin cable',
      'Modo invitado',
      'Centro de Energía inteligente',
    ])
      expect(within(card(n)).queryByText(/Opcional|Ya viene de fábrica/)).toBeNull()
    expect(screen.queryByText(/Se están probando/)).toBeNull()
    for (const g of installerFeatures.groups)
      for (const f of g.features) expect(['incluido', 'opcional', 'deFabrica']).toContain(f.status)
  })

  it('never lists the owner-only engine sound', () => {
    const { container } = renderPage()
    expect(container.textContent).not.toMatch(/AVAS|Mustang|V8/)
  })

  it('every feature has the fields the page shows, and unique ids', () => {
    const all = installerFeatures.groups.flatMap((g) => g.features)
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length)
    for (const f of all)
      for (const k of ['name', 'benefit', 'where', 'photo'] as const) expect(f[k].length).toBeGreaterThan(0)
  })

  it('explains what can be undone, what you need, and links Preparar mi Vigo', () => {
    renderPage()
    expect(screen.getByText(/Qué no cambia y qué podés deshacer/)).toBeTruthy()
    expect(screen.getByText(/«Quitar todo»/)).toBeTruthy()
    expect(screen.getByText('Unos 20 minutos.')).toBeTruthy()
    expect(screen.getByText(/Un cable USB-C a USB-C no sirve/)).toBeTruthy()
    expect(screen.getByText('USB-A a USB-C')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Preparar mi Vigo' }).getAttribute('href')).toBe(
      '/mi-vigo/preparar'
    )
  })
})

describe('InstallerFeaturesPage gate: beta testers and moderators only', () => {
  const comingSoon = () => screen.findByText('Muy pronto')

  it('shows the list to a signed-in user whose car is in beta', async () => {
    mocks.auth = signedIn(false)
    mocks.fetchCarBeta.mockResolvedValue({ allowed: true, beta: true, request: null })
    renderPage()
    expect(await screen.findByRole('region', { name: 'Al volante' })).toBeTruthy()
    expect(screen.queryByText('Muy pronto')).toBeNull()
  })

  it('shows the list to a moderator without asking for beta', () => {
    renderPage()
    expect(screen.getByRole('region', { name: 'Al volante' })).toBeTruthy()
    expect(mocks.fetchCarBeta).not.toHaveBeenCalled()
  })

  it('shows only «Muy pronto» to a signed-in user whose car is not in beta', async () => {
    mocks.auth = signedIn(false)
    mocks.fetchCarBeta.mockResolvedValue({ allowed: true, beta: false, request: null })
    renderPage()
    expect(await comingSoon()).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByText(/Waze/)).toBeNull()
  })

  it('shows only «Muy pronto» to a view-only member (allowed:false) or when the call fails', async () => {
    mocks.auth = signedIn(false)
    mocks.fetchCarBeta.mockResolvedValue({ allowed: false })
    const { unmount } = renderPage()
    expect(await comingSoon()).toBeTruthy()
    unmount()
    mocks.fetchCarBeta.mockResolvedValue(null)
    renderPage()
    expect(await comingSoon()).toBeTruthy()
  })

  it('shows only «Muy pronto» when signed out, without calling the database', async () => {
    mocks.auth = { user: null, profile: null, status: 'signedOut' }
    renderPage()
    expect(await comingSoon()).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    expect(mocks.fetchCarBeta).not.toHaveBeenCalled()
  })
})
