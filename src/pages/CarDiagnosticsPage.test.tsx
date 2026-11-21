// specs/car-diagnostics.md test plan: empty when the feature is absent, list renders, "Ver registros" shows the logs, delete asks twice.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CarDiagnosticRow } from '../types'

const mocks = vi.hoisted(() => ({
  fetchDiagnostics: vi.fn(),
  fetchReport: vi.fn(),
  deleteDiagnostic: vi.fn(),
}))

vi.mock('../lib/carDiagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carDiagnostics')>()),
  fetchDiagnostics: mocks.fetchDiagnostics,
  fetchReport: mocks.fetchReport,
  deleteDiagnostic: mocks.deleteDiagnostic,
}))

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
})
