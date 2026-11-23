// A8 "Firmware tracker" (specs/car-firmware-a8.md): head-unit software versions reported by linked cars. The community table
// is an anonymous aggregate (car_firmware_versions(), migration 0056: version, number of cars, month last seen); the member's
// own version comes from their car_status row (0054). Versions look like DFRD_S32O_MPU_V01811_20250814_128G (vigo-hack
// updates/FIRMWARE_RESEARCH.md section 3): V01811 = version number, 20250814 = build date.
import { supabase } from './supabaseClient'

export interface FirmwareVersionRow {
  fw_version: string
  cars: number
  last_seen_month: string
}

export interface ParsedFirmware {
  /** The number after "_V" (1811 for V01811); null when the name does not follow the pattern. */
  version: number | null
  /** Build date YYYY-MM-DD; null when absent or not a real date. */
  buildDate: string | null
}

export function parseFirmware(name: string): ParsedFirmware {
  const v = /(?:^|_)V(\d{3,6})(?:_|$)/.exec(name)
  const d = /(?:^|_)(20\d{2})(\d{2})(\d{2})(?:_|$)/.exec(name)
  let buildDate: string | null = null
  if (d) {
    const iso = `${d[1]}-${d[2]}-${d[3]}`
    const t = new Date(`${iso}T00:00:00Z`)
    if (!Number.isNaN(t.getTime()) && t.toISOString().startsWith(iso)) buildDate = iso
  }
  return { version: v ? Number(v[1]) : null, buildDate }
}

/** Newer first: by version number, then build date; unparseable names sort last, then by name. */
export function compareFirmware(a: string, b: string): number {
  const pa = parseFirmware(a)
  const pb = parseFirmware(b)
  if (pa.version !== pb.version) {
    if (pa.version === null) return 1
    if (pb.version === null) return -1
    return pb.version - pa.version
  }
  if (pa.buildDate !== pb.buildDate) {
    if (pa.buildDate === null) return 1
    if (pb.buildDate === null) return -1
    return pb.buildDate < pa.buildDate ? -1 : 1
  }
  return a < b ? 1 : a > b ? -1 : 0
}

export function sortFirmware(rows: FirmwareVersionRow[]): FirmwareVersionRow[] {
  return [...rows].sort((x, y) => compareFirmware(x.fw_version, y.fw_version))
}

/**
 * "¿Hay una versión más nueva?" for the member's car: the newest version seen that is strictly newer than `mine`
 * (comparable only when both names carry a version number), or null.
 */
export function newerThan(mine: string, rows: FirmwareVersionRow[]): FirmwareVersionRow | null {
  const own = parseFirmware(mine)
  if (own.version === null) return null
  const newer = sortFirmware(rows).filter((r) => {
    const p = parseFirmware(r.fw_version)
    return p.version !== null && compareFirmware(r.fw_version, mine) < 0
  })
  return newer[0] ?? null
}

/** The community table; [] when unavailable (no backend, 0056 not applied). */
export async function fetchFirmwareVersions(): Promise<FirmwareVersionRow[]> {
  const client = supabase
  if (!client) return []
  try {
    const { data, error } = await client.rpc('car_firmware_versions')
    if (error || !Array.isArray(data)) return []
    return sortFirmware(data)
  } catch {
    return []
  }
}

/** The member's own car's version (RLS: own vehicle only); null when unknown. */
export async function fetchOwnFirmware(): Promise<string | null> {
  const client = supabase
  if (!client) return null
  try {
    const { data, error } = await client.from('car_status').select('fw_version').maybeSingle()
    return error || !data ? null : (data.fw_version ?? null)
  } catch {
    return null
  }
}

/** "agosto de 2025" from 2025-08-01. */
export function monthLabel(isoDate: string): string {
  const t = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(t.getTime())) return isoDate
  return t.toLocaleDateString('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
