// Station alerts (specs/station-alerts.md, PLAN.md B4): a station whose
// latest check-in in the last RECENT_FAILURE_HOURS is "falló" (no
// "funcionó" since) is shown as failing. Computed in the browser from the
// existing public station_reports rows -- no new table or view.
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export const RECENT_FAILURE_HOURS = 48

export interface StationReportLite {
  station_id: string
  status: string
  created_at: string
}

export interface StationAlert {
  failures: number
  lastFailureAt: string
}

export function recentFailures(reports: StationReportLite[], now: Date = new Date()): Map<string, StationAlert> {
  const since = now.getTime() - RECENT_FAILURE_HOURS * 3600_000
  const byStation = new Map<string, StationReportLite[]>()
  for (const r of reports) {
    if (new Date(r.created_at).getTime() < since) continue
    const list = byStation.get(r.station_id) ?? []
    list.push(r)
    byStation.set(r.station_id, list)
  }
  const alerts = new Map<string, StationAlert>()
  for (const [stationId, list] of byStation) {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    const lastFailure = list.find((r) => r.status === 'fallo')
    if (!lastFailure) continue
    // A "funcionó" newer than the last failure clears the alert; "ocupado" says nothing about it.
    const workedSince = list.some((r) => r.status === 'funciono' && r.created_at > lastFailure.created_at)
    if (workedSince) continue
    alerts.set(stationId, {
      failures: list.filter((r) => r.status === 'fallo').length,
      lastFailureAt: lastFailure.created_at,
    })
  }
  return alerts
}

let inflight: { at: number; promise: Promise<Map<string, StationAlert>> } | null = null

export function fetchStationAlerts(): Promise<Map<string, StationAlert>> {
  const client = supabase
  if (!client) return Promise.resolve(new Map<string, StationAlert>())
  if (inflight && Date.now() - inflight.at < 60_000) return inflight.promise
  const since = new Date(Date.now() - RECENT_FAILURE_HOURS * 3600_000).toISOString()
  const promise = Promise.resolve(
    client
      .from('station_reports')
      .select('station_id, status, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000)
  ).then(({ data, error }) => {
    if (error) inflight = null
    return recentFailures(data ?? [])
  })
  inflight = { at: Date.now(), promise }
  return promise
}

// Call after the user posts a check-in so the badge updates right away.
export function invalidateStationAlerts(): void {
  inflight = null
}

export function useStationAlerts(refreshKey: unknown = null): Map<string, StationAlert> {
  const [alerts, setAlerts] = useState<Map<string, StationAlert>>(new Map())
  useEffect(() => {
    let cancelled = false
    void fetchStationAlerts().then((a) => {
      if (!cancelled) setAlerts(a)
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])
  return alerts
}
