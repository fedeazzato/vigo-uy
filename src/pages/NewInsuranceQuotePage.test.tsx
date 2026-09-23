import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NewInsuranceQuotePage from './NewInsuranceQuotePage'

// A minimal always-succeeds stand-in for the real client (which is null in
// this test env -- no VITE_SUPABASE_* -- and would otherwise no-op every
// submit). Every test below stops at a validation error or never submits,
// so this doesn't change their behavior.
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: null, status: 'signedIn' }),
}))

vi.mock('../lib/communityData', () => ({
  invalidateCommunityCache: vi.fn(),
  fetchInsuranceProviders: () =>
    Promise.resolve({
      providers: [
        { slug: 'bse', name: 'BSE', sort_order: 10, created_at: '2026-07-01T00:00:00Z' },
        { slug: 'mapfre', name: 'Mapfre Uruguay', sort_order: 20, created_at: '2026-07-01T00:00:00Z' },
      ],
      error: null,
    }),
}))

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/costos/seguro/nuevo']}>
      <Routes>
        <Route path="/costos/seguro/nuevo" element={<NewInsuranceQuotePage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function waitForProvidersToLoad() {
  await waitFor(() => expect(screen.getByText('BSE')).toBeTruthy())
}

describe('NewInsuranceQuotePage', () => {
  it('surfaces a validation error instead of submitting when the provider is missing', async () => {
    renderForm()
    await waitForProvidersToLoad()

    // Fill every other required field so native HTML5 validation (required,
    // empty text inputs) doesn't block submission before the app's own
    // provider check ever runs -- only "provider" is left unset, and it's
    // not marked `required` in the DOM precisely because, being a closed
    // select, an empty selection would otherwise be unreachable dead code.
    fireEvent.change(screen.getByLabelText('🎂 Edad promedio'), { target: { value: '35' } })
    fireEvent.change(screen.getByLabelText('💰 Costo total del período (UYU)'), { target: { value: '45000' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Elegí una aseguradora.')).toBeTruthy()
  })

  it('computes and shows the live per-year cost preview from total cost and period', async () => {
    renderForm()
    await waitForProvidersToLoad()

    fireEvent.change(screen.getByLabelText('⏳ Período contratado'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('💰 Costo total del período (UYU)'), {
      target: { value: '150000' },
    })

    expect(screen.getByText('= $50.000/año')).toBeTruthy()
  })

  it('shows no preview until a valid total cost is entered', async () => {
    renderForm()
    await waitForProvidersToLoad()

    expect(screen.queryByText(/\/año$/)).toBeNull()
  })

  it('reveals the glass-coverage limit input only while its checkbox is checked, and clears it on uncheck', async () => {
    renderForm()
    await waitForProvidersToLoad()

    expect(screen.queryByLabelText('🪟 Límite de cobertura (UYU)')).toBeNull()

    const glassCheckbox = screen.getByLabelText('Incluye reparación de cristales (parabrisas, etc.)')
    fireEvent.click(glassCheckbox)

    const limitInput = screen.getByLabelText('🪟 Límite de cobertura (UYU)')
    fireEvent.change(limitInput, { target: { value: '20000' } })
    expect(limitInput.getAttribute('value')).toBe('20000')

    fireEvent.click(glassCheckbox)
    expect(screen.queryByLabelText('🪟 Límite de cobertura (UYU)')).toBeNull()

    fireEvent.click(glassCheckbox)
    expect(screen.getByLabelText('🪟 Límite de cobertura (UYU)').getAttribute('value')).toBe('')
  })

  it('hides the deductible field only for "Todo Riesgo sin Deducible", the one tier that structurally has none', async () => {
    renderForm()
    await waitForProvidersToLoad()

    expect(screen.getByLabelText('💸 Deducible (UYU)')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('📄 Nivel de cobertura'), {
      target: { value: 'todo_riesgo_sin_franquicia' },
    })
    expect(screen.queryByLabelText('💸 Deducible (UYU)')).toBeNull()

    fireEvent.change(screen.getByLabelText('📄 Nivel de cobertura'), { target: { value: 'terceros' } })
    expect(screen.getByLabelText('💸 Deducible (UYU)')).toBeTruthy()
  })

  it('highlights a missing deductible without blocking submission, on coverage levels that expect one', async () => {
    renderForm()
    await waitForProvidersToLoad()

    fireEvent.change(screen.getByLabelText('📄 Nivel de cobertura'), { target: { value: 'terceros' } })
    expect(screen.getByText(/falta este dato/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('💸 Deducible (UYU)'), { target: { value: '5000' } })
    expect(screen.queryByText(/falta este dato/)).toBeNull()

    fireEvent.change(screen.getByLabelText('💸 Deducible (UYU)'), { target: { value: '' } })
    expect(screen.getByText(/falta este dato/)).toBeTruthy()
  })
})
