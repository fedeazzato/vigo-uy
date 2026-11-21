import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PrepareCarPage from './PrepareCarPage'

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
    render(<PrepareCarPage />)
    expect(screen.getByText('Antes de empezar: leé esto')).toBeTruthy()
    expect(screen.queryByLabelText('Número de serie PDSN')).toBeNull()
    expect(screen.queryByLabelText('Código maestro')).toBeNull()
    accept()
    expect(screen.getByLabelText('Número de serie PDSN')).toBeTruthy()
  })

  it('computes the Factory code in the browser and echoes the PDSN used', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<PrepareCarPage />)
    accept()
    typePdsn(' TESTPDSN 0000000001 ')
    expect((await screen.findByLabelText('Código de fábrica')).textContent).toBe('DfCs250d52d0#!')
    expect(screen.getByText('TESTPDSN0000000001')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    for (const call of setItem.mock.calls) expect(String(call[1])).not.toContain('TESTPDSN')
  })

  it('shows the fixed Master code and the tries warning', () => {
    render(<PrepareCarPage />)
    accept()
    expect(screen.getByLabelText('Código maestro').textContent).toBe('DfCs0715#!')
    expect(screen.getAllByText(/unos 5 intentos/).length).toBe(2)
  })

  it('shows no Factory code for an invalid PDSN', () => {
    render(<PrepareCarPage />)
    accept()
    typePdsn('AB-12')
    expect(screen.getByText(/solo letras y números/)).toBeTruthy()
    expect(screen.queryByLabelText('Código de fábrica')).toBeNull()
  })

  it('warns about lowercase letters', async () => {
    render(<PrepareCarPage />)
    accept()
    typePdsn('testpdsn0001')
    expect(await screen.findByText(/Escribiste letras minúsculas/)).toBeTruthy()
  })

  it('keeps the download disabled until the installer is hosted', () => {
    render(<PrepareCarPage />)
    accept()
    expect(screen.getByRole('button', { name: /Próximamente/ })).toHaveProperty('disabled', true)
  })
})
