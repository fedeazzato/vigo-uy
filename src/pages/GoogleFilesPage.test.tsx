import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import GoogleFilesPage from './GoogleFilesPage'

describe('GoogleFilesPage (specs/prepare-my-vigo.md D7)', () => {
  it('links only APKMirror search pages, one per file', () => {
    render(
      <MemoryRouter>
        <GoogleFilesPage />
      </MemoryRouter>
    )
    const external = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => h.startsWith('http'))
    expect(external.length).toBe(4)
    for (const h of external) expect(h.startsWith('https://www.apkmirror.com/')).toBe(true)
    expect(external.filter((h) => h.includes('s=')).length).toBe(3)
  })

  it('states the variant rules the installer checks', () => {
    render(
      <MemoryRouter>
        <GoogleFilesPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/la más nueva que sea 26.45 o mayor/)).toBeTruthy()
    expect(screen.getByText(/firma oficial de Waze o de Google/)).toBeTruthy()
    expect(screen.getAllByText(/arm64-v8a/).length).toBeGreaterThan(1)
    expect(screen.getByRole('link', { name: 'Preparar mi Vigo' }).getAttribute('href')).toBe('/mi-vigo/preparar')
  })
})
