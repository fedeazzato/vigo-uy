// specs/car-firmware-a8.md R4 and specs/car-service-reminders-a4.md R4: the two Mi Vigo cards.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  fetchFirmwareVersions: vi.fn(),
  fetchOwnFirmware: vi.fn(),
  fetchServiceReminderData: vi.fn(),
  auth: { status: 'signedIn' },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../lib/carFirmware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carFirmware')>()),
  fetchFirmwareVersions: mocks.fetchFirmwareVersions,
  fetchOwnFirmware: mocks.fetchOwnFirmware,
}))
vi.mock('../lib/serviceReminder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/serviceReminder')>()),
  fetchServiceReminderData: mocks.fetchServiceReminderData,
}))

import FirmwareCard from './FirmwareCard'
import ServiceReminderCard from './ServiceReminderCard'

const OLD = 'DFRD_S32O_MPU_V01811_20250814_128G'
const NEW = 'DFRD_S32O_MPU_V01902_20260301_128G'
const rows = [
  { fw_version: NEW, cars: 2, last_seen_month: '2026-11-01' },
  { fw_version: OLD, cars: 5, last_seen_month: '2026-10-01' },
]

beforeEach(() => {
  mocks.auth.status = 'signedIn'
  mocks.fetchFirmwareVersions.mockReset()
  mocks.fetchOwnFirmware.mockReset()
  mocks.fetchServiceReminderData.mockReset()
})

describe('FirmwareCard', () => {
  it('hidden while nothing was reported', async () => {
    mocks.fetchFirmwareVersions.mockResolvedValue([])
    mocks.fetchOwnFirmware.mockResolvedValue(null)
    const { container } = render(<FirmwareCard />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.innerHTML).toBe('')
  })

  it('table plus "there is a newer version" for an older car', async () => {
    mocks.fetchFirmwareVersions.mockResolvedValue(rows)
    mocks.fetchOwnFirmware.mockResolvedValue(OLD)
    render(<FirmwareCard />)
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/^¿Hay una versión más nueva\?Sí/)
    expect(status.textContent).toContain(NEW)
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText(`${OLD} (tu auto)`)).toBeTruthy()
  })

  it('"no" for the newest; signed out sees only the table', async () => {
    mocks.fetchFirmwareVersions.mockResolvedValue(rows)
    mocks.fetchOwnFirmware.mockResolvedValue(NEW)
    const r = render(<FirmwareCard />)
    expect((await screen.findByRole('status')).textContent).toMatch(/No, tu auto tiene la más nueva/)
    r.unmount()
    mocks.auth.status = 'signedOut'
    render(<FirmwareCard />)
    await screen.findByText('14/08/2025')
    expect(screen.queryByRole('status')).toBeNull()
    expect(mocks.fetchOwnFirmware).toHaveBeenCalledTimes(1)
  })
})

describe('ServiceReminderCard', () => {
  const renderIt = () =>
    render(
      <MemoryRouter>
        <ServiceReminderCard />
      </MemoryRouter>
    )

  it('hidden without an odometer', async () => {
    mocks.fetchServiceReminderData.mockResolvedValue(null)
    const { container } = renderIt()
    await new Promise((r) => setTimeout(r, 0))
    expect(container.innerHTML).toBe('')
  })

  it('soon: the next service, km left and the prefilled draft link', async () => {
    mocks.fetchServiceReminderData.mockResolvedValue({
      odometerKm: 14180,
      observedAt: new Date().toISOString(),
      entries: [{ odometer_km: 5000, service_date: new Date().toISOString().slice(0, 10) }],
    })
    renderIt()
    expect(await screen.findByText('Service de 15.000 km')).toBeTruthy()
    expect(screen.getByText('Faltan 820 km.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Registrar service' }).getAttribute('href')).toBe(
      '/costos/nuevo?km=14180&tipo=Service+de+15.000+km'
    )
  })

  it('ok: no draft link', async () => {
    mocks.fetchServiceReminderData.mockResolvedValue({
      odometerKm: 1200,
      observedAt: new Date().toISOString(),
      entries: [],
    })
    renderIt()
    expect(await screen.findByText('Primer service (5.000 km)')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
