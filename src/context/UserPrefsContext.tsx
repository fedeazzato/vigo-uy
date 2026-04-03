import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { Model, Color } from '../types'

export type { Model, Color }
export type Theme = 'light' | 'dark' | null  // null = follow system

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
  theme: Theme
}

interface UserPrefsContextValue extends Prefs {
  setModel: (m: Model) => void
  setColor: (c: Color) => void
  setTheme: (t: Theme) => void
  clear: () => void
}

const UserPrefsContext = createContext<UserPrefsContextValue | null>(null)

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>
      return { model: parsed.model ?? null, color: parsed.color ?? null, theme: parsed.theme ?? null }
    }
  } catch { /* ignore */ }
  return { model: null, color: null, theme: null }
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

  // Apply data-theme to <html> and keep it in sync with system changes
  useEffect(() => {
    const apply = (systemDark: boolean) => {
      const effective = prefs.theme ?? (systemDark ? 'dark' : 'light')
      document.documentElement.setAttribute('data-theme', effective)
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)

    const listener = (e: MediaQueryListEvent) => {
      // Only react to system changes when user hasn't picked a preference
      if (prefs.theme === null) apply(e.matches)
    }
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [prefs.theme])

  return (
    <UserPrefsContext.Provider value={{
      ...prefs,
      setModel: (model) => update({ ...prefs, model }),
      setColor: (color) => update({ ...prefs, color }),
      setTheme: (theme) => update({ ...prefs, theme }),
      clear: () => update({ model: null, color: null, theme: null }),
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
