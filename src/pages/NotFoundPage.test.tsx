import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import NotFoundPage from './NotFoundPage'

describe('NotFoundPage', () => {
  it('explains what happened and links back home and to the guide', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/No encontramos esa página/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'inicio' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Aprender' }).getAttribute('href')).toBe('/aprender')
  })
})
