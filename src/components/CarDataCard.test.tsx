import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CarDataCard from './CarDataCard'
import * as carData from '../lib/carData'

vi.mock('../lib/carData', async (orig) => {
  const real = await orig<typeof import('../lib/carData')>()
  return {
    ...real,
    fetchMyCarData: vi.fn(),
    fetchFaultCounts: vi.fn(() => Promise.resolve([{ source: 'tpms', code: 'tpms_fl', vehicles: 4 }])),
    setSharing: vi.fn(() => Promise.resolve(null)),
    deleteMyCarData: vi.fn(() => Promise.resolve(true)),
  }
})

const empty = { sharing: null, odometer: [], battery: [], drives: [], faults: [] }

describe('CarDataCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing without car data', async () => {
    vi.mocked(carData.fetchMyCarData).mockResolvedValue(empty)
    const { container } = render(<CarDataCard />)
    await waitFor(() => expect(carData.fetchMyCarData).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('shows verified km, warnings with the community count, and all switches off by default', async () => {
    vi.mocked(carData.fetchMyCarData).mockResolvedValue({
      ...empty,
      odometer: [
        { vehicle_id: 'v', day: '2026-11-01', odometer_km: 1000, anomaly: false },
        { vehicle_id: 'v', day: '2026-11-02', odometer_km: 1100, anomaly: false },
      ],
      faults: [
        {
          id: 'f',
          vehicle_id: 'v',
          device_id: null,
          client_id: 'c',
          observed_at: '2026-11-02T10:00:00Z',
          source: 'tpms',
          code: 'tpms_fl',
          value: 1,
          odometer_km: 1100,
          received_at: '2026-11-02T10:00:00Z',
        },
      ],
    })
    render(<CarDataCard />)
    expect((await screen.findAllByText(/1.100 km/)).length).toBeGreaterThan(0)
    expect(screen.getByText('Presión neumático delantero izquierdo')).toBeTruthy()
    expect(await screen.findByText(/otros 4 dueños/)).toBeTruthy()
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(5)
    switches.forEach((s) => expect((s as HTMLInputElement).checked).toBe(false))
    fireEvent.click(switches[0])
    await waitFor(() => expect(carData.setSharing).toHaveBeenCalledWith('verified_km_public', true))
  })
})
