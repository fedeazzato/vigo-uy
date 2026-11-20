import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RequireAuth from './RequireAuth'

const auth = vi.hoisted(() => ({ current: { status: 'signedOut' } }))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth.current,
}))

function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <p>login from={from}</p>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route element={<RequireAuth />}>
          <Route path="/mi-vigo/vincular" element={<p>pairing page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  it('keeps the query string when bouncing to login (car QR link)', () => {
    auth.current = { status: 'signedOut' }
    renderAt('/mi-vigo/vincular?c=K7Q2M9')
    expect(screen.getByText('login from=/mi-vigo/vincular?c=K7Q2M9')).toBeTruthy()
  })

  it('renders the page when signed in', () => {
    auth.current = { status: 'signedIn' }
    renderAt('/mi-vigo/vincular?c=K7Q2M9')
    expect(screen.getByText('pairing page')).toBeTruthy()
  })

  it('renders nothing while the session loads', () => {
    auth.current = { status: 'loading' }
    const { container } = renderAt('/mi-vigo/vincular')
    expect(container.textContent).toBe('')
  })
})
