import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PrepareCarPage from './PrepareCarPage'
import { MemoryRouter } from 'react-router-dom'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrepareCarPage />
    </MemoryRouter>
  )
}

function accept() {
  fireEvent.click(screen.getByRole('checkbox', { name: /Leí todo esto/ }))
}

function typePdsn(value: string) {
  fireEvent.change(screen.getByLabelText('Número de serie PDSN'), { target: { value } })
}

describe('PrepareCarPage (specs/prepare-my-vigo.md)', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('hides the steps and codes until the disclaimer is accepted', () => {
    renderPage()
    expect(screen.getByText('Antes de empezar: leé esto')).toBeTruthy()
    expect(screen.queryByLabelText('Número de serie PDSN')).toBeNull()
    expect(screen.queryByLabelText('Código maestro')).toBeNull()
    accept()
    expect(screen.getByLabelText('Número de serie PDSN')).toBeTruthy()
  })

  it('computes the Factory code in the browser and echoes the PDSN used', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderPage()
    accept()
    typePdsn(' TESTPDSN 0000000001 ')
    expect((await screen.findByLabelText('Código de fábrica')).textContent).toBe('DfCs250d52d0#!')
    expect(screen.getByText('TESTPDSN0000000001')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    for (const call of setItem.mock.calls) expect(String(call[1])).not.toContain('TESTPDSN')
  })

  it('shows the fixed Master code and the tries warning', () => {
    renderPage()
    accept()
    expect(screen.getByLabelText('Código maestro').textContent).toBe('DfCs0715#!')
    expect(screen.getAllByText(/unos 5 intentos/).length).toBe(2)
  })

  it('shows no Factory code for an invalid PDSN', () => {
    renderPage()
    accept()
    typePdsn('AB-12')
    expect(screen.getByText(/solo letras y números/)).toBeTruthy()
    expect(screen.queryByLabelText('Código de fábrica')).toBeNull()
  })

  it('warns about lowercase letters', async () => {
    renderPage()
    accept()
    typePdsn('testpdsn0001')
    expect(await screen.findByText(/Escribiste letras minúsculas/)).toBeTruthy()
  })

  it('keeps the download disabled until the installer is hosted', () => {
    renderPage()
    accept()
    expect(screen.getByRole('button', { name: /Próximamente/ })).toHaveProperty('disabled', true)
  })

  it('links the Google files page and explains sign-in and the service buttons', () => {
    renderPage()
    accept()
    const links = screen.getAllByRole('link', { name: /cuáles bajar|Archivos de Google para el instalador/ })
    expect(links.length).toBe(2)
    for (const l of links) expect(l.getAttribute('href')).toBe('/mi-vigo/preparar/archivos-google')
    expect(screen.getByText(/Probar otra manera/)).toBeTruthy()
    expect(screen.getByText(/Ocultar también las apps/)).toBeTruthy()
    expect(screen.getAllByText(/Después del service/).length).toBeGreaterThan(0)
  })
})
