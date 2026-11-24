// Proposal 9: the site's own confirm dialog replaces window.confirm().
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { confirmDialog, confirmLabelFor } from './confirmDialog'

describe('confirmLabelFor', () => {
  it('uses the question verb, or "Continuar"', () => {
    expect(confirmLabelFor('¿Borrar este viaje? No se puede deshacer.')).toBe('Borrar')
    expect(confirmLabelFor('Ya hay una frase guardada. ¿Reemplazarla por esta?')).toBe('Reemplazar')
    expect(confirmLabelFor('Vas a dejar tu vehículo. ¿Continuar?')).toBe('Continuar')
    expect(confirmLabelFor('¿Seguro que querés suspender a Ana?')).toBe('Continuar')
    expect(confirmLabelFor('Sin pregunta')).toBe('Continuar')
  })
})

describe('confirmDialog', () => {
  it('resolves true on the explicit confirm button and removes itself', async () => {
    const p = confirmDialog('¿Borrar este service? No se puede deshacer.')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('¿Borrar este service? No se puede deshacer.')).toBeTruthy()
    // focus starts on the safe button
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
    await expect(p).resolves.toBe(true)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('Esc cancels', async () => {
    const p = confirmDialog('¿Descartar los cambios sin guardar?')
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await expect(p).resolves.toBe(false)
  })

  it('Tab stays inside the dialog', async () => {
    const p = confirmDialog('¿Quitar a Ana del vehículo?')
    const dialog = await screen.findByRole('alertdialog')
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const ok = screen.getByRole('button', { name: 'Quitar' })
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(ok)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
    fireEvent.click(cancel)
    await expect(p).resolves.toBe(false)
  })
})
