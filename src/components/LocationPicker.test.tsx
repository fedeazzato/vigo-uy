import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import LocationPicker from './LocationPicker'

const { useUserPrefsMock, clickHandlerRef } = vi.hoisted(() => ({
  useUserPrefsMock: vi.fn(),
  clickHandlerRef: { current: null as null | ((e: { latlng: { lat: number; lng: number } }) => void) },
}))

vi.mock('../context/UserPrefsContext', () => ({
  useUserPrefs: useUserPrefsMock,
}))

// Same rationale as TripMap.test.tsx / StationsMap.test.tsx: react-leaflet
// needs real DOM layout jsdom doesn't provide. The click/drag interactions
// this component adds on top of plain display are exercised by capturing
// the handlers react-leaflet would normally wire up and invoking them
// directly, rather than trying to simulate real map gestures.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: ({ eventHandlers }: { eventHandlers?: { dragend?: (e: unknown) => void } }) => (
    <button
      type="button"
      data-testid="drag-marker"
      onClick={() =>
        eventHandlers?.dragend?.({ target: { getLatLng: () => ({ lat: -33.1, lng: -56.2 }) } })
      }
    >
      drag marker
    </button>
  ),
  useMapEvents: (handlers: { click: (e: { latlng: { lat: number; lng: number } }) => void }) => {
    clickHandlerRef.current = handlers.click
    return null
  },
  useMap: () => ({ getZoom: () => 7, setView: vi.fn() }),
}))

describe('LocationPicker', () => {
  beforeEach(() => {
    useUserPrefsMock.mockReset().mockReturnValue({ effectiveTheme: 'light' })
    clickHandlerRef.current = null
  })

  it('calls onChange with the clicked coordinates', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)

    act(() => {
      clickHandlerRef.current?.({ latlng: { lat: -34.9011, lng: -56.1645 } })
    })

    expect(onChange).toHaveBeenCalledWith({ lat: -34.9011, lng: -56.1645 })
  })

  it('shows no marker/coords until a value is set', () => {
    render(<LocationPicker value={null} onChange={vi.fn()} />)
    expect(screen.queryByTestId('drag-marker')).toBeNull()
  })

  it('calls onChange with the dragged coordinates', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={{ lat: -34.9, lng: -56.1 }} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('drag-marker'))

    expect(onChange).toHaveBeenCalledWith({ lat: -33.1, lng: -56.2 })
  })

  it('displays the current coordinates once a value is set', () => {
    render(<LocationPicker value={{ lat: -34.9011, lng: -56.1645 }} onChange={vi.fn()} />)
    expect(screen.getByText('-34.9011, -56.1645')).toBeTruthy()
  })

  describe('"Usar mi ubicación"', () => {
    const getCurrentPositionMock = vi.fn()

    beforeEach(() => {
      getCurrentPositionMock.mockReset()
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: getCurrentPositionMock },
        configurable: true,
      })
    })

    it('calls onChange with the geolocated coordinates on success', () => {
      getCurrentPositionMock.mockImplementation((success: (pos: unknown) => void) => {
        success({ coords: { latitude: -34.9011, longitude: -56.1645 } })
      })
      const onChange = vi.fn()
      render(<LocationPicker value={null} onChange={onChange} />)

      fireEvent.click(screen.getByText('📍 Usar mi ubicación'))

      expect(onChange).toHaveBeenCalledWith({ lat: -34.9011, lng: -56.1645 })
    })

    it('shows an inline message and does not call onChange when geolocation fails', () => {
      getCurrentPositionMock.mockImplementation(
        (_success: (pos: unknown) => void, error: (err: unknown) => void) => {
          error({ code: 1 })
        }
      )
      const onChange = vi.fn()
      render(<LocationPicker value={null} onChange={onChange} />)

      fireEvent.click(screen.getByText('📍 Usar mi ubicación'))

      expect(onChange).not.toHaveBeenCalled()
      expect(
        screen.getByText('No pudimos acceder a tu ubicación. Marcá el punto directamente en el mapa.')
      ).toBeTruthy()
    })

    it('shows an inline message when the browser has no geolocation support', () => {
      Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
      const onChange = vi.fn()
      render(<LocationPicker value={null} onChange={onChange} />)

      fireEvent.click(screen.getByText('📍 Usar mi ubicación'))

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText('Este navegador no puede compartir tu ubicación.')).toBeTruthy()
    })
  })
})
