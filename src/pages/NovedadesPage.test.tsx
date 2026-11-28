import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const fetchReleaseNotes = vi.fn()
const fetchGithubNotes = vi.fn<() => Promise<Record<string, string>>>(() => Promise.resolve({}))
vi.mock('../lib/carReleaseNotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carReleaseNotes')>()),
  fetchReleaseNotes: () => fetchReleaseNotes() as unknown,
  fetchGithubNotes: () => fetchGithubNotes(),
}))

vi.mock('../components/FirmwareCard', () => ({ default: () => null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))

import NovedadesPage from './NovedadesPage'

describe('NovedadesPage', () => {
  it('lists releases with app names and Google notices', async () => {
    fetchReleaseNotes.mockResolvedValue([
      {
        serial: 7,
        published_at: '2026-11-20T12:00:00Z',
        note: 'Carga muestra el costo por viaje.',
        apps: [{ package: 'com.vigo.carga', version: '0.5.1' }],
        notices: [{ package: 'com.waze', label: 'Waze 5.30' }],
      },
    ])
    render(
      <MemoryRouter>
        <NovedadesPage />
      </MemoryRouter>
    )
    expect(await screen.findByText(/Versión 7/)).toBeTruthy()
    expect(screen.getByText('Carga 0.5.1')).toBeTruthy()
    expect(screen.getByText(/Waze \(Waze 5.30\)/)).toBeTruthy()
  })

  it('shows the GitHub notes of a release and marks a beta one', async () => {
    fetchGithubNotes.mockResolvedValueOnce({ r5: '## Qué cambia\n- **Mi Vigo 2.32**\n  - Volver a Waze.' })
    fetchReleaseNotes.mockResolvedValue([
      {
        serial: 5,
        published_at: '2026-11-28T12:00:00Z',
        note: null,
        apps: [{ package: 'com.vigo.accountslauncher', version: '2.32' }],
        notices: [],
        channel: 'beta',
      },
    ])
    render(
      <MemoryRouter>
        <NovedadesPage />
      </MemoryRouter>
    )
    expect(await screen.findByText('Volver a Waze.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Qué cambia' })).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
    // the notes replace the bare version list
    expect(screen.queryByText('Mi Vigo 2.32', { selector: 'li' })).toBeNull()
  })

  it('says there is nothing yet before the migration', async () => {
    fetchReleaseNotes.mockResolvedValue(null)
    render(
      <MemoryRouter>
        <NovedadesPage />
      </MemoryRouter>
    )
    expect(await screen.findByText(/Todavía no hay novedades/)).toBeTruthy()
  })
})
