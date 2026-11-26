// specs/community-notifications.md: the notifications page.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const mocks = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
}))

vi.mock('../lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/notifications')>()),
  fetchNotifications: mocks.fetchNotifications,
  markNotificationsRead: mocks.markNotificationsRead,
  deleteNotification: mocks.deleteNotification,
}))

import NotificationsPage from './NotificationsPage'

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: 'u',
  kind: 'station_failure',
  actor_id: null,
  station_id: 's',
  trip_log_id: null,
  service_entry_id: null,
  part_purchase_id: null,
  title: `Reportaron una falla en Estación ${id}`,
  read_at: null,
  created_at: new Date().toISOString(),
  ...over,
})

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>
  )
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    mocks.fetchNotifications.mockReset()
    mocks.markNotificationsRead.mockReset().mockResolvedValue({ error: null })
    mocks.deleteNotification.mockReset().mockResolvedValue({ error: null })
  })

  it('shows the empty state with how to follow', async () => {
    mocks.fetchNotifications.mockResolvedValue({ rows: [], error: null })
    renderPage()
    expect(await screen.findByText(/No tenés notificaciones/)).toBeTruthy()
  })

  it('lists notifications, links them and marks all read', async () => {
    mocks.fetchNotifications.mockResolvedValue({
      rows: [row('A'), row('B', { read_at: '2026-11-21T00:00:00Z', kind: 'comment', station_id: null })],
      error: null,
    })
    renderPage()
    const link = await screen.findByText('Reportaron una falla en Estación A')
    expect(link.closest('a')?.getAttribute('href')).toBe('/carga')
    expect(screen.getByText('1 sin leer')).toBeTruthy()
    fireEvent.click(screen.getByText('Marcar todas como leídas'))
    await waitFor(() => expect(mocks.markNotificationsRead).toHaveBeenCalledWith())
  })

  it('deletes one notification', async () => {
    mocks.fetchNotifications.mockResolvedValue({ rows: [row('A')], error: null })
    renderPage()
    fireEvent.click(await screen.findByLabelText('Borrar notificación: Reportaron una falla en Estación A'))
    await waitFor(() => expect(screen.queryByText('Reportaron una falla en Estación A')).toBeNull())
    expect(mocks.deleteNotification).toHaveBeenCalledWith('A')
  })
})
