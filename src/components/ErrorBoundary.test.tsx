import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

function Bomb(): never {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
  })
})
