import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import NewPartPurchasePage from './NewPartPurchasePage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: null, status: 'signedIn' }),
}))

function renderPurchaseForm() {
  return render(
    <MemoryRouter initialEntries={['/repuestos/nuevo']}>
      <UserPrefsProvider>
        <Routes>
          <Route path="/repuestos/nuevo" element={<NewPartPurchasePage />} />
        </Routes>
      </UserPrefsProvider>
    </MemoryRouter>
  )
}

describe('NewPartPurchasePage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hides the odometer field for accessory categories and updates the placeholder', () => {
    renderPurchaseForm()

    expect(screen.getByLabelText('📏 Kilometraje')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('🗂️ Categoría'), { target: { value: 'carlinkit' } })

    expect(screen.queryByLabelText('📏 Kilometraje')).toBeNull()
    expect(screen.getByPlaceholderText('Ej: Adaptador inalámbrico para Android Auto')).toBeTruthy()
  })

  it('prefills the store field from a recognized link', () => {
    renderPurchaseForm()

    fireEvent.change(screen.getByLabelText('🔗 Link a la publicación (opcional)'), {
      target: { value: 'https://www.amazon.com/dp/B08N5WRWNW' },
    })

    expect(screen.getByLabelText('🏪 ¿Dónde?').getAttribute('value')).toBe('Amazon')
  })
})
