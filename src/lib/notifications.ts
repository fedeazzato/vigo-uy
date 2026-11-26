// In-site notifications and follows (specs/community-notifications.md,
// PLAN.md B6; station failure alerts from specs/station-alerts.md, B4).
// Rows are written only by database triggers (migration 0058); the client
// reads its own, marks them read and deletes them, and manages follows.
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import type { Tables, TablesInsert } from './database.types'

export type NotificationRow = Tables<'notifications'>
export type NotificationKind =
  | 'station_failure'
  | 'comment'
  | 'reaction'
  | 'vehicle_trip'
  | 'vehicle_service'
  | 'car_rollback'
  | 'car_charge_draft'
  | 'car_beta_request'
  | 'car_beta'
  | 'car_guest_mode'

export type FollowKind = 'station' | 'trip_log' | 'service_entry' | 'part_purchase'
export interface FollowTarget {
  kind: FollowKind
  id: string
}

const FOLLOW_COLUMN = {
  station: 'station_id',
  trip_log: 'trip_log_id',
  service_entry: 'service_entry_id',
  part_purchase: 'part_purchase_id',
} as const satisfies Record<FollowKind, keyof Tables<'content_follows'>>

export const NOTIFICATION_ICON: Record<NotificationKind, string> = {
  station_failure: '⚠️',
  comment: '💬',
  reaction: '👍',
  vehicle_trip: '🚗',
  vehicle_service: '🔧',
  car_rollback: '↩️',
  car_charge_draft: '🔌',
  car_beta_request: '🧪',
  car_beta: '🧪',
  car_guest_mode: '🕶️',
}

// Where tapping a notification goes. Content has no per-item page yet, so
// it opens the list the item lives in.
export function notificationLink(
  n: Pick<NotificationRow, 'kind' | 'part_purchase_id' | 'service_entry_id'>
): string {
  switch (n.kind) {
    case 'station_failure':
      return '/carga'
    case 'vehicle_trip':
    case 'vehicle_service':
      return '/mi-vigo/registros'
    case 'car_rollback':
    case 'car_beta_request':
      return '/moderacion?tab=versiones'
    case 'car_charge_draft':
      return '/mi-vigo/borradores'
    case 'car_beta':
    case 'car_guest_mode':
      return '/mi-vigo'
    default:
      if (n.part_purchase_id) return '/cuidar/repuestos'
      if (n.service_entry_id) return '/costos'
      return '/comunidad'
  }
}

export function countUnread(rows: Pick<NotificationRow, 'read_at'>[]): number {
  return rows.filter((r) => r.read_at === null).length
}

export async function fetchNotifications(
  limit = 50
): Promise<{ rows: NotificationRow[]; error: string | null }> {
  const client = supabase
  if (!client) return { rows: [], error: null }
  const { data, error } = await client
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { rows: data ?? [], error: error ? toFriendlyError(error) : null }
}

export async function fetchUnreadCount(): Promise<number> {
  const client = supabase
  if (!client) return 0
  const { count } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  return count ?? 0
}

export async function markNotificationsRead(ids?: string[]): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const { error } = await client.rpc('mark_notifications_read', ids ? { p_ids: ids } : {})
  notifyUnreadChanged()
  return { error: error ? toFriendlyError(error) : null }
}

export async function deleteNotification(id: string): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const { error } = await client.from('notifications').delete().eq('id', id)
  notifyUnreadChanged()
  return { error: error ? toFriendlyError(error) : null }
}

// ── Unread badge (header bell) ───────────────────────────────────────────

const POLL_MS = 60_000
const listeners = new Set<() => void>()

function notifyUnreadChanged(): void {
  for (const l of listeners) l()
}

export function useUnreadNotifications(userId: string | null): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId || !supabase) {
      setCount(0)
      return
    }
    let cancelled = false
    const load = () => {
      void fetchUnreadCount().then((n) => {
        if (!cancelled) setCount(n)
      })
    }
    load()
    listeners.add(load)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => {
      cancelled = true
      listeners.delete(load)
      clearInterval(timer)
    }
  }, [userId])
  return count
}

// ── Follows ──────────────────────────────────────────────────────────────

let followsPromise: Promise<Set<string>> | null = null

function followKey(t: FollowTarget): string {
  return `${t.kind}:${t.id}`
}

export function followsToKeys(rows: Partial<Tables<'content_follows'>>[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const kind of Object.keys(FOLLOW_COLUMN) as FollowKind[]) {
      const id = row[FOLLOW_COLUMN[kind]]
      if (id) keys.add(followKey({ kind, id }))
    }
  }
  return keys
}

// One query for every follow button on the page (cached until a toggle).
export function fetchMyFollows(): Promise<Set<string>> {
  const client = supabase
  if (!client) return Promise.resolve(new Set())
  if (!followsPromise) {
    followsPromise = Promise.resolve(client.from('content_follows').select('*')).then(({ data, error }) => {
      if (error) followsPromise = null
      return followsToKeys(data ?? [])
    })
  }
  return followsPromise
}

export function isFollowing(keys: Set<string>, target: FollowTarget): boolean {
  return keys.has(followKey(target))
}

function followRow(target: FollowTarget, userId: string): TablesInsert<'content_follows'> {
  const pick = (kind: FollowKind) => (target.kind === kind ? target.id : null)
  return {
    user_id: userId,
    station_id: pick('station'),
    trip_log_id: pick('trip_log'),
    service_entry_id: pick('service_entry'),
    part_purchase_id: pick('part_purchase'),
  }
}

export async function setFollow(
  target: FollowTarget,
  follow: boolean,
  userId: string
): Promise<{ error: string | null }> {
  const client = supabase
  if (!client) return { error: null }
  const column = FOLLOW_COLUMN[target.kind]
  const { error } = follow
    ? await client.from('content_follows').insert(followRow(target, userId))
    : await client.from('content_follows').delete().eq(column, target.id).eq('user_id', userId)
  followsPromise = null
  return { error: error ? toFriendlyError(error) : null }
}

export function useFollow(target: FollowTarget, userId: string | null) {
  const [following, setFollowing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetchMyFollows().then((keys) => {
      if (!cancelled) setFollowing(isFollowing(keys, target))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target is identified by kind+id
  }, [userId, target.kind, target.id])

  async function toggle() {
    if (!userId) return
    const next = !following
    setFollowing(next)
    const res = await setFollow(target, next, userId)
    if (res.error) {
      setFollowing(!next)
      setError(res.error)
    } else {
      setError(null)
    }
  }
  return { following, toggle, error }
}
