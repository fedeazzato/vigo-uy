import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CityCombobox from './CityCombobox'

function ControlledCombobox() {
  const [value, setValue] = useState('')
  return <CityCombobox id="city" value={value} onChange={setValue} placeholder="Montevideo" />
}

describe('CityCombobox', () => {
  it('filters suggestions case-insensitively as the user types', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'monte' } })
    expect(screen.getByRole('option', { name: 'Montevideo' })).toBeTruthy()
  })

  it('selecting an option fills the input and closes the dropdown', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'monte' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Montevideo' }))
    expect(input.value).toBe('Montevideo')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('ArrowDown then Enter selects the first highlighted match', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'sal' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(['Salinas', 'Salto']).toContain(input.value)
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('Escape closes the dropdown without changing the value', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'monte' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('option')).toBeNull()
    expect(input.value).toBe('monte')
  })

  it('accepts free text with no match in the list', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Buenos Aires' } })
    expect(input.value).toBe('Buenos Aires')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('snaps free text to canonical casing on blur', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'montevideo' } })
    fireEvent.blur(input)
    expect(input.value).toBe('Montevideo')
  })

  it('closes the dropdown on blur (click outside)', () => {
    render(<ControlledCombobox />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'monte' } })
    expect(screen.getByRole('option', { name: 'Montevideo' })).toBeTruthy()
    fireEvent.blur(input)
    expect(screen.queryByRole('option')).toBeNull()
  })
})
