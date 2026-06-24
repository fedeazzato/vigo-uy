import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { Model, Color } from '../types'

export type { Model, Color }
export type Theme = 'light' | 'dark' | null  // null = follow system
export type EffectiveTheme = 'light' | 'dark'

export const MODELS: Model[] = ['E2', 'E2+']
export const COLORS: Color[] = ['Blanco', 'Verde', 'Gris', 'Beige', 'Negro']

export const COLOR_HEX: Record<Color, string> = {
  Blanco: '#EEEEE6',
  Verde:  '#7A924E',  // olive green
  Gris:   '#B8BCBF',  // silver
  Beige:  '#FFEFD6',  // light sand
  Negro:  '#1C1C1C',
}

// CSS border value for each color swatch/dot, or null if no border needed
export const COLOR_BORDER: Record<Color, string | null> = {
  Blanco: 'var(--border-strong)',
  Verde:  null,
  Gris:   'var(--border-strong)',
  Beige:  'var(--border-strong)',
  Negro:  'var(--swatch-dark-border)',
}

// Whether the swatch label/checkmark needs dark text for contrast
export const COLOR_DARK_TEXT: Record<Color, boolean> = {
  Blanco: true,
  Verde:  true,   // olive is light enough for dark text
  Gris:   true,   // silver is light
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
  effectiveTheme: EffectiveTheme
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
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  function update(next: Prefs) {
    setPrefs(next)
    save(next)
  }

  // Only used as a fallback until the user explicitly picks Claro/Oscuro
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  const effectiveTheme: EffectiveTheme = prefs.theme ?? (systemDark ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])

  return (
    <UserPrefsContext.Provider value={{
      ...prefs,
      effectiveTheme,
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
