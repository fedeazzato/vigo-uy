// Diagnostics sent from the car's Mi Vigo (specs/car-diagnostics.md R3): list, read (join the base64 parts, gunzip in the browser),
// turn into plain text for download, delete. Everything degrades to "nothing there" when the table is missing (migration 0051 not
// applied) or the caller may not read it (RLS: the vehicle's members and the moderators).
import { supabase } from './supabaseClient'
import type { CarDiagnosticRow } from '../types'

const COLUMNS = 'id, vehicle_id, device_id, parts, received, note, apps, complete, created_at, completed_at'

/** What each app answered on the car (Mi Vigo DiagReport.State). */
export const STATE_LABELS: Record<string, string> = {
  ok: 'respondió',
  no_answer: 'instalada, sin respuesta',
  not_installed: 'no instalada',
  file: 'archivo',
  invalid: 'respuesta no válida',
}

/** Friendly names of our packages; unknown ones show as sent. */
export const APP_LABELS: Record<string, string> = {
  'com.vigo.accountslauncher': 'Mi Vigo',
  'com.vigo.carga': 'Carga',
  'com.df.autonavi': 'Cargadores',
  'com.vigo.copiloto': 'Copiloto',
  'com.vigo.tts.es': 'Voz en español',
  'com.vigo.dashcam.app': 'Dashcam',
  'com.vigo.aahotspot': 'Android Auto inalámbrico',
}

export interface DiagAppSummary {
  app: string
  version: string
  state: string
  crashes: number
  chars: number
}

export interface DiagReportApp {
  app: string
  label: string
  state: string
  version: string
  device_build: string
  truncated: boolean
  log: string
  crashes: string[]
}

export interface DiagReport {
  schema: number
  created_at: number
  mivigo: string
  device_build: string
  location: boolean
  note: string
  apps: DiagReportApp[]
}

export function appLabel(app: string): string {
  if (app.startsWith('file:')) return `Archivo ${app.slice(5)}`
  return APP_LABELS[app] ?? app
}

/** The jsonb summary of part 0, defensively typed (anything odd is dropped). */
export function summarizeApps(apps: unknown): DiagAppSummary[] {
  if (!Array.isArray(apps)) return []
  return apps.flatMap((a): DiagAppSummary[] => {
    if (typeof a !== 'object' || a === null) return []
    const o = a as Record<string, unknown>
    if (typeof o.app !== 'string') return []
    return [
      {
        app: o.app,
        version: typeof o.version === 'string' ? o.version : '',
        state: typeof o.state === 'string' ? o.state : 'invalid',
        crashes: typeof o.crashes === 'number' ? o.crashes : 0,
        chars: typeof o.chars === 'number' ? o.chars : 0,
      },
    ]
  })
}

/** Newest first, at most 50. `null` = the feature is not there (table missing, signed out, any error). */
export async function fetchDiagnostics(): Promise<CarDiagnosticRow[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('car_diagnostics')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/** Joins the parts in order; null when one is missing (an upload still incomplete). */
export function joinParts(rows: { part: number; data: string }[], parts: number): string | null {
  const byPart = new Map(rows.map((r) => [r.part, r.data]))
  let out = ''
  for (let i = 0; i < parts; i++) {
    const d = byPart.get(i)
    if (d === undefined) return null
    out += d
  }
  return out
}

/** base64(gzip(text)) -> text, with the browser's DecompressionStream. Throws on bad input. */
export async function gunzipBase64(b64: string): Promise<string> {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** The report JSON Mi Vigo built (core DiagReport.combinedJson, schema 1); null if it is not one. */
export function parseReport(json: string): DiagReport | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (o.schema !== 1 || !Array.isArray(o.apps)) return null
  const apps = o.apps.flatMap((a): DiagReportApp[] => {
    if (typeof a !== 'object' || a === null) return []
    const x = a as Record<string, unknown>
    if (typeof x.app !== 'string') return []
    return [
      {
        app: x.app,
        label: str(x.label) || appLabel(x.app),
        state: str(x.state) || 'invalid',
        version: str(x.version),
        device_build: str(x.device_build),
        truncated: x.truncated === true,
        log: str(x.log),
        crashes: Array.isArray(x.crashes) ? x.crashes.filter((c): c is string => typeof c === 'string') : [],
      },
    ]
  })
  return {
    schema: 1,
    created_at: typeof o.created_at === 'number' ? o.created_at : 0,
    mivigo: str(o.mivigo),
    device_build: str(o.device_build),
    location: o.location === true,
    note: str(o.note),
    apps,
  }
}

/** Reads one diagnostic: parts -> report. `null` when it cannot be read (missing parts, bad data, no access). */
export async function fetchReport(row: Pick<CarDiagnosticRow, 'id' | 'parts'>): Promise<DiagReport | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('car_diagnostic_parts')
      .select('part, data')
      .eq('diagnostic_id', row.id)
      .order('part', { ascending: true })
    if (error || !data) return null
    const b64 = joinParts(data, row.parts)
    if (b64 === null) return null
    return parseReport(await gunzipBase64(b64))
  } catch {
    return null
  }
}

export async function deleteDiagnostic(id: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('car_diagnostics').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}

function stamp(ms: number): string {
  return ms > 0 ? new Date(ms).toISOString() : '?'
}

/** Plain text for "Descargar": header, note, then per app its state, crashes and log. */
export function reportToText(r: DiagReport, id: string): string {
  const lines: string[] = [
    `Diagnóstico ${id}`,
    `Creado en el auto: ${stamp(r.created_at)}`,
    `Mi Vigo ${r.mivigo} · ${r.device_build}`,
    `Ubicación incluida: ${r.location ? 'sí' : 'no'}`,
    `Nota: ${r.note || '(sin nota)'}`,
    '',
  ]
  for (const a of r.apps) {
    lines.push(
      `==== ${a.label} (${a.app}) ${a.version} · ${STATE_LABELS[a.state] ?? a.state}${a.truncated ? ' · recortado' : ''}`
    )
    if (a.device_build) lines.push(a.device_build)
    a.crashes.forEach((c, i) => {
      lines.push(`---- cierre inesperado ${i + 1}`)
      lines.push(c.trimEnd())
    })
    if (a.log) {
      lines.push('---- registro')
      lines.push(a.log.trimEnd())
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** The first 8 characters of the upload id: what the car shows as "Código del informe". */
export function reportCode(id: string): string {
  return id.slice(0, 8)
}
