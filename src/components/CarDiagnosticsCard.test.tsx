import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import CarDiagnosticsCard from './CarDiagnosticsCard'

const mocks = vi.hoisted(() => ({ fetchDiagnostics: vi.fn() }))
vi.mock('../lib/carDiagnostics', () => ({ fetchDiagnostics: mocks.fetchDiagnostics }))

function renderCard() {
  return render(
    <MemoryRouter>
      <CarDiagnosticsCard collapsible="Más detalles (para curiosos)" />
    </MemoryRouter>
  )
}

describe('CarDiagnosticsCard', () => {
  beforeEach(() => mocks.fetchDiagnostics.mockReset())

  it('renders nothing, not even the collapsible section, without diagnostics', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([])
    const { container } = renderCard()
    await waitFor(() => expect(mocks.fetchDiagnostics).toHaveBeenCalled())
    expect(container.querySelector('details')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('shows a closed "Más detalles" section with the card when there are diagnostics', async () => {
    mocks.fetchDiagnostics.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    const { container } = renderCard()
    await screen.findByText(/Hay 2 diagnósticos enviados/)
    const details = container.querySelector('details')
    expect(details?.open).toBe(false)
    expect(details?.querySelector('summary')?.textContent).toMatch(/Más detalles/)
  })
})
