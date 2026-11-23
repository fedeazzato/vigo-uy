// In-site notifications (specs/community-notifications.md, PLAN.md B6):
// station failure alerts (B4), comments/reactions on posts the user wrote
// or follows, and new trips/services from the user's vehicle group.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Alert, Skeleton } from '../components/UI'
import {
  NOTIFICATION_ICON,
  countUnread,
  deleteNotification,
  fetchNotifications,
  markNotificationsRead,
  notificationLink,
} from '../lib/notifications'
import type { NotificationKind, NotificationRow } from '../lib/notifications'
import { formatRelativeTime } from '../lib/format'
import styles from './NotificationsPage.module.css'

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchNotifications()
    setRows(res.rows)
    setError(res.error)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function markAll() {
    const res = await markNotificationsRead()
    if (res.error) setError(res.error)
    else void load()
  }

  async function open(n: NotificationRow) {
    if (n.read_at === null) await markNotificationsRead([n.id])
  }

  async function remove(id: string) {
    const res = await deleteNotification(id)
    if (res.error) setError(res.error)
    else setRows((r) => (r ? r.filter((x) => x.id !== id) : r))
  }

  const unread = rows ? countUnread(rows) : 0

  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle="Avisos de estaciones que seguís, comentarios en tus publicaciones y novedades de tu Vigo."
      />
      {error && <Alert type="danger">{error}</Alert>}
      <Card>
        {rows === null ? (
          <Skeleton lines={4} />
        ) : rows.length === 0 ? (
          <p className={styles.empty}>
            No tenés notificaciones. Tocá «🔔 Avisarme si falla» en una estación de <Link to="/carga">Carga</Link> o
            «🔔 Seguir» en una publicación para recibir avisos.
          </p>
        ) : (
          <>
            {unread > 0 && (
              <div className={styles.toolbar}>
                <span>
                  {unread} sin leer
                </span>
                <button type="button" className={styles.linkBtn} onClick={() => void markAll()}>
                  Marcar todas como leídas
                </button>
              </div>
            )}
            <ul className={styles.list}>
              {rows.map((n) => (
                <li key={n.id} className={`${styles.item} ${n.read_at === null ? styles.unread : ''}`}>
                  <span className={styles.icon} aria-hidden="true">
                    {NOTIFICATION_ICON[n.kind as NotificationKind] ?? '🔔'}
                  </span>
                  <Link to={notificationLink(n)} className={styles.body} onClick={() => void open(n)}>
                    <span className={styles.title}>{n.title}</span>
                    <span className={styles.time}>{formatRelativeTime(new Date(n.created_at))}</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => void remove(n.id)}
                    aria-label={`Borrar notificación: ${n.title}`}
                  >
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  )
}
