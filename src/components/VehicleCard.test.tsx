// One-time family invites (0082): no code by default, each tap makes a new one, only creator/control may create.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  createFamilyInvite: vi.fn(),
  fetchMyCarRole: vi.fn(),
}))

const vehicleRow = { id: 'v1', created_by: 'u1', plate: null, join_code: null, model: null, color: null, created_at: '' }

vi.mock('../lib/supabaseClient', () => {
  const builder = {
    select: () => builder,
    maybeSingle: () => Promise.resolve({ data: vehicleRow, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: [{ user_id: 'u1', car_role: 'control' }], error: null }),
  }
  return { supabase: { from: () => builder, rpc: vi.fn() } }
})
vi.mock('../lib/communityData', () => ({ fetchAuthorNames: () => Promise.resolve({ u1: 'Ana' }) }))
// A stable object: a new user on every render would re-run the card's load effect forever.
const authValue = vi.hoisted(() => ({ user: { id: 'u1' } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => authValue }))
vi.mock('../lib/carRole', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRole')>()),
  fetchMyCarRole: mocks.fetchMyCarRole,
}))
vi.mock('../lib/familyInvite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/familyInvite')>()),
  createFamilyInvite: mocks.createFamilyInvite,
}))

import VehicleCard from './VehicleCard'

describe('VehicleCard family invite', () => {
  beforeEach(() => {
    mocks.createFamilyInvite.mockReset()
    mocks.fetchMyCarRole.mockReset()
  })

  it('shows no code by default and creates a fresh one on every tap', async () => {
    mocks.fetchMyCarRole.mockResolvedValue('owner')
    mocks.createFamilyInvite
      .mockResolvedValueOnce({ invite: { code: 'ABCDEFGH', expiresAt: '' }, error: null })
      .mockResolvedValueOnce({ invite: { code: 'JKMNPQRS', expiresAt: '' }, error: null })
    render(<VehicleCard />)
    const button = await screen.findByRole('button', { name: 'Sumar a tu familia' })
    expect(screen.queryByText(/ABCD/)).toBeNull()

    fireEvent.click(button)
    expect(await screen.findByText('ABCD EFGH')).toBeTruthy()
    expect(screen.getByText('Vence en 24 h, sirve para una persona.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Crear otro código' }))
    expect(await screen.findByText('JKMN PQRS')).toBeTruthy()
    expect(screen.queryByText('ABCD EFGH')).toBeNull()
    expect(mocks.createFamilyInvite).toHaveBeenCalledTimes(2)
  })

  it('shows the server error and no code when creation fails', async () => {
    mocks.fetchMyCarRole.mockResolvedValue('control')
    mocks.createFamilyInvite.mockResolvedValue({ invite: null, error: 'Creaste muchos códigos seguidos.' })
    render(<VehicleCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sumar a tu familia' }))
    expect(await screen.findByText('Creaste muchos códigos seguidos.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copiar' })).toBeNull()
  })

  it('a view-only member cannot create codes', async () => {
    mocks.fetchMyCarRole.mockResolvedValue('view')
    render(<VehicleCard />)
    await waitFor(() => expect(mocks.fetchMyCarRole).toHaveBeenCalled())
    expect(await screen.findByText(/Pedile el código/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sumar a tu familia' })).toBeNull()
  })

  it('never uses the word "vincular"', async () => {
    mocks.fetchMyCarRole.mockResolvedValue('owner')
    const { container } = render(<VehicleCard />)
    await screen.findByRole('button', { name: 'Sumar a tu familia' })
    expect(container.textContent?.toLowerCase()).not.toMatch(/vincul/)
  })
})
