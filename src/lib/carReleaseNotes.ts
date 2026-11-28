import { supabase } from './supabaseClient'

// D1 "Novedades" (specs/car-updates.md, migrations 0072 + 0087): the published car releases from car_release_notes() (stable;
// beta ones too for beta testers and moderators), and the notes written on each one’s GitHub release.

export interface ReleaseNote {
  serial: number
  published_at: string
  note: string | null
  apps: { package: string; version: string }[]
  notices: { package: string; label: string }[]
  /** Missing before migration 0087 (which returns stable rows only until then). */
  channel?: string
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

// The release files and notes live on the public GitHub releases of this repo; release r<serial> is tagged "r<serial>"
// (vigo-hack updater/tools/release.sh).
export const GITHUB_RELEASES_API =
  'https://api.github.com/repos/fedeazzato/vigo-releases/releases?per_page=100'

export function releaseTag(serial: number): string {
  return `r${serial}`
}

/** Notes by tag. Empty when GitHub cannot be read (offline, its hourly limit): the page then shows the app versions. */
export async function fetchGithubNotes(): Promise<Record<string, string>> {
  try {
    const res = await fetch(GITHUB_RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return {}
    const list: unknown = await res.json()
    if (!Array.isArray(list)) return {}
    const notes: Record<string, string> = {}
    for (const r of list as { tag_name?: unknown; body?: unknown; draft?: unknown }[]) {
      if (typeof r?.tag_name === 'string' && typeof r.body === 'string' && r.body.trim() && r.draft !== true)
        notes[r.tag_name] = r.body
    }
    return notes
  } catch {
    return {}
  }
}
