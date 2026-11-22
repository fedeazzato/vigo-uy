// specs/car-diagnostics.md test plan: empty when the feature is absent, list renders, "Ver registros" shows the logs, delete asks twice,
// whose car for moderators (members see no names), search by code.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CarDiagnosticRow } from '../types'

const mocks = vi.hoisted(() => ({
  fetchDiagnostics: vi.fn(),
  fetchReport: vi.fn(),
  deleteDiagnostic: vi.fn(),
  fetchVehicleNames: vi.fn(),
}))

vi.mock('../lib/carDiagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carDiagnostics')>()),
  fetchDiagnostics: mocks.fetchDiagnostics,
  fetchReport: mocks.fetchReport,
  deleteDiagnostic: mocks.deleteDiagnostic,
  fetchVehicleNames: mocks.fetchVehicleNames,
}))

const auth = vi.hoisted(() => {
  const current: { profile: { is_moderator: boolean } } = { profile: { is_moderator: false } }
  return { current }
})
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))

import CarDiagnosticsPage from './CarDiagnosticsPage'

const ROW: CarDiagnosticRow = {
  id: '0b9d6a7e-1c2f-4e3d-8a5b-9c0d1e2f3a4b',
  vehicle_id: 'v',
  device_id: null,
  parts: 2,
  received: 2,
  note: 'Se cerró Carga',
  apps: [
    { app: 'com.vigo.accountslauncher', version: '2.4 (7)', state: 'ok', crashes: 0, chars: 100 },
    { app: 'com.vigo.carga', version: '0.4', state: 'ok', crashes: 1, chars: 200 },
  ],
  complete: true,
  created_at: new Date(Date.UTC(2026, 10, 21, 15)).toISOString(),
  completed_at: null,
}

const page = () =>
  render(
    <MemoryRouter>
      <CarDiagnosticsPage />
    </MemoryRouter>
  )

beforeEach(() => {
  mocks.fetchDiagnostics.mockReset()
  mocks.fetchReport.mockReset()
  mocks.deleteDiagnostic.mockReset()
  mocks.fetchVehicleNames.mockReset()
  mocks.fetchVehicleNames.mockResolvedValue(new Map())
  auth.current = { profile: { is_moderator: false } }
})

describe('CarDiagnosticsPage', () => {
  it('says there is nothing when the table is missing', async () => {
    mocks.fetchDiagnostics.mockResolvedValue(null)
    page()
    expect(await screen.findByText(/No hay diagnósticos/)).toBeTruthy()
  })

  it('lists a diagnostic with its code, note and apps', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([ROW])
    page()
    expect(await screen.findByText(/código 0b9d6a7e/)).toBeTruthy()
    expect(screen.getByText('«Se cerró Carga»')).toBeTruthy()
    expect(screen.getByText('Carga')).toBeTruthy()
    expect(screen.getByText('1 cierre inesperado')).toBeTruthy()
  })

  it('an incomplete upload cannot be opened', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([{ ...ROW, complete: false, received: 1 }])
    page()
    expect(await screen.findByText('Incompleto (1 de 2 partes)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver registros' }).hasAttribute('disabled')).toBe(true)
  })

  it('"Ver registros" loads and shows the logs', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([ROW])
    mocks.fetchReport.mockResolvedValue({
      schema: 1,
      created_at: 0,
      mivigo: '2.4',
      device_build: 'V01811',
      location: false,
      note: '',
      apps: [
        {
          app: 'com.vigo.carga',
          label: 'Carga',
          state: 'ok',
          version: '0.4',
          device_build: '',
          truncated: false,
          log: 'linea del registro',
          crashes: [],
        },
      ],
    })
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver registros' }))
    expect(await screen.findByText('linea del registro')).toBeTruthy()
    expect(screen.getByText(/ubicación no incluida/)).toBeTruthy()
    expect(mocks.fetchReport).toHaveBeenCalledWith(ROW)
  })

  it('delete needs a second tap', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([ROW])
    mocks.deleteDiagnostic.mockResolvedValue(true)
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
    expect(mocks.deleteDiagnostic).not.toHaveBeenCalled()
    expect(screen.getByText(/otra vez/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
    await waitFor(() => expect(screen.queryByText(/código 0b9d6a7e/)).toBeNull())
    expect(mocks.deleteDiagnostic).toHaveBeenCalledWith(ROW.id)
  })

  const OTHER: CarDiagnosticRow = {
    ...ROW,
    id: '7c3a9f10-2b4d-4e6f-8a1b-3c5d7e9f1a2b',
    vehicle_id: '5f1e2d3c-0000-4000-8000-000000000000',
    note: 'Otro auto',
  }
  const MINE: CarDiagnosticRow = { ...ROW, vehicle_id: 'a1b2c3d4-0000-4000-8000-000000000000' }

  it('a moderator with reports of two cars sees whose car each one is', async () => {
    auth.current = { profile: { is_moderator: true } }
    mocks.fetchDiagnostics.mockResolvedValue([MINE, OTHER])
    mocks.fetchVehicleNames.mockResolvedValue(new Map([[MINE.vehicle_id, 'Ana y Beto']]))
    page()
    expect(await screen.findByText('🚗 Auto de Ana y Beto')).toBeTruthy()
    // Not in the public list: the vehicle id stands in.
    expect(screen.getByText('🚗 Auto 5f1e2d3c')).toBeTruthy()
    expect(mocks.fetchVehicleNames).toHaveBeenCalledWith([MINE.vehicle_id, OTHER.vehicle_id].sort())
  })

  it('a member sees no names and nothing is looked up', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([MINE, { ...MINE, id: '11111111-2222-4333-8444-555555555555' }])
    page()
    expect(await screen.findByText(/código 0b9d6a7e/)).toBeTruthy()
    expect(screen.queryByText(/🚗/)).toBeNull()
    expect(screen.getByLabelText('Buscar por código')).toBeTruthy()
    expect(mocks.fetchVehicleNames).not.toHaveBeenCalled()
  })

  it('a single report shows no search box', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([ROW])
    page()
    expect(await screen.findByText(/código 0b9d6a7e/)).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('the search filters by code, and by name for moderators', async () => {
    auth.current = { profile: { is_moderator: true } }
    mocks.fetchDiagnostics.mockResolvedValue([MINE, OTHER])
    mocks.fetchVehicleNames.mockResolvedValue(new Map([[MINE.vehicle_id, 'Ana y Beto']]))
    page()
    expect(await screen.findByText('🚗 Auto de Ana y Beto')).toBeTruthy()
    const search = screen.getByLabelText('Buscar por código o nombre')
    fireEvent.change(search, { target: { value: ' 7C3A ' } })
    expect(screen.queryByText(/código 0b9d6a7e/)).toBeNull()
    expect(screen.getByText(/código 7c3a9f10/)).toBeTruthy()
    fireEvent.change(search, { target: { value: 'ana' } })
    expect(await screen.findByText(/código 0b9d6a7e/)).toBeTruthy()
    expect(screen.queryByText(/código 7c3a9f10/)).toBeNull()
    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(screen.getByText('Ningún diagnóstico coincide con «zzzz».')).toBeTruthy()
  })
})
