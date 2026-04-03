import { createContext, useContext, useState, ReactNode } from 'react'
import type { Model, Color } from '../types'

export type { Model, Color }

export const MODELS: Model[] = ['E2', 'E2+']
export const COLORS: Color[] = ['Blanco', 'Verde', 'Gris', 'Beige', 'Negro']

export const COLOR_HEX: Record<Color, string> = {
  Blanco: '#EEEEE6',
  Verde:  '#2D6A4F',
  Gris:   '#7A7C7D',
  Beige:  '#C4AA85',
  Negro:  '#1C1C1C',
}

// Whether the swatch label/checkmark needs dark text for contrast
export const COLOR_DARK_TEXT: Record<Color, boolean> = {
  Blanco: true,
  Verde:  false,
  Gris:   false,
  Beige:  true,
  Negro:  false,
}

const STORAGE_KEY = 'vigo-prefs'

interface Prefs {
  model: Model | null
  color: Color | null
}

interface UserPrefsContextValue extends Prefs {
  setModel: (m: Model) => void
  setColor: (c: Color) => void
  clear: () => void
}

const UserPrefsContext = createContext<UserPrefsContextValue | null>(null)

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Prefs
  } catch { /* ignore */ }
  return { model: null, color: null }
}

function save(prefs: Prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function UserPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load)

  function update(next: Prefs) {
    setPrefs(next)
    save(next)
  }

  return (
    <UserPrefsContext.Provider value={{
      ...prefs,
      setModel: (model) => update({ ...prefs, model }),
      setColor:  (color)  => update({ ...prefs, color }),
      clear: () => update({ model: null, color: null }),
    }}>
      {children}
    </UserPrefsContext.Provider>
  )
}

export function useUserPrefs(): UserPrefsContextValue {
  const ctx = useContext(UserPrefsContext)
  if (!ctx) throw new Error('useUserPrefs must be used within UserPrefsProvider')
  return ctx
}
