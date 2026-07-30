import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

function Bomb(): never {
  throw new Error('kaboom')
}

function ChunkBomb(): never {
  throw new Error('Failed to fetch dynamically imported module: https://example.com/assets/PartsPage-abc123.js')
}

describe('ErrorBoundary', () => {
  const reloadSpy = vi.fn()

  beforeEach(() => {
    // React logs the caught error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sessionStorage.clear()
    reloadSpy.mockClear()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>contenido sano</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('contenido sano')).toBeTruthy()
    expect(screen.queryByText('Algo salió mal.')).toBeNull()
  })

  it('shows the Spanish fallback card with a reload button when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Algo salió mal.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeTruthy()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('auto-reloads once and shows a neutral message when a lazy chunk fails to load', () => {
    render(
      <ErrorBoundary>
        <ChunkBomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Hay una versión nueva')).toBeTruthy()
    expect(screen.queryByText('Algo salió mal.')).toBeNull()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to the manual error card instead of reloading again within the cooldown', () => {
    sessionStorage.setItem('vigo-chunk-reload-at', String(Date.now()))
    render(
      <ErrorBoundary>
        <ChunkBomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Algo salió mal.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeTruthy()
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
