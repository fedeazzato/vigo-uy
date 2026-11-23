import { supabase } from './supabaseClient'

// D1 "Novedades" (specs/car-updates.md, migration 0072): what each stable car release brings, from car_release_notes().

export interface ReleaseNote {
  serial: number
  published_at: string
  note: string | null
  apps: { package: string; version: string }[]
  notices: { package: string; label: string }[]
}

/** Our packages as owners know them (installer bundle + Mi Vigo). Unknown packages show as they are. */
export const APP_NAMES: Record<string, string> = {
  'com.vigo.carga': 'Carga',
  'com.vigo.copiloto': 'Copiloto',
  'com.df.autonavi': 'Cargadores',
  'com.vigo.accountslauncher': 'Mi Vigo',
  'com.vigo.tts.es': 'Voz en español',
  'com.vigo.dashcam.app': 'Dashcam',
  'com.google.android.gms': 'Servicios de Google Play',
  'com.waze': 'Waze',
}

export function appName(pkg: string): string {
  return APP_NAMES[pkg] ?? pkg
}

function isNote(r: unknown): r is ReleaseNote {
  const o = r as ReleaseNote
  return (
    !!o &&
    typeof o.serial === 'number' &&
    typeof o.published_at === 'string' &&
    Array.isArray(o.apps) &&
    Array.isArray(o.notices)
  )
}

/** null when the list cannot be read (migration 0072 not applied, offline). */
export async function fetchReleaseNotes(): Promise<ReleaseNote[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('car_release_notes', { p_limit: 30 })
  if (error || !Array.isArray(data)) return null
  return (data as unknown[]).filter(isNote)
}
