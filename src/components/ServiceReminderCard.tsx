// A4 "Próximo service" (specs/car-service-reminders-a4.md R4): from the odometer the linked car reports and the vehicle's
// service entries, the next service of the importer's schedule and how far it is. "Registrar service" opens the new-entry form
// prefilled with the car's odometer and the service's name (the draft; nothing is saved until the owner submits it). Hidden
// until the car has reported an odometer.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  draftLink,
  fetchServiceReminderData,
  nextService,
  reminderText,
  type ServiceReminderData,
} from '../lib/serviceReminder'
import { formatRelativeTime } from '../lib/format'
import { Alert, Card, CardTitle } from './UI'
import styles from './FirmwareCard.module.css'

export default function ServiceReminderCard() {
  const [data, setData] = useState<ServiceReminderData | null>(null)

  useEffect(() => {
    let alive = true
    void fetchServiceReminderData().then((d) => {
      if (alive) setData(d)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!data) return null
  const r = nextService(data.odometerKm, data.entries)
  const text = reminderText(r)

  return (
    <Card>
      <CardTitle icon="🛠️">Próximo service</CardTitle>
      <p className={styles.big}>{r.label}</p>
      {r.state === 'due' ? <Alert type="warning">{text}</Alert> : <p className={styles.own}>{text}</p>}
      <p className={styles.note}>
        Odómetro del auto: {data.odometerKm.toLocaleString('es-UY')} km (
        {formatRelativeTime(new Date(data.observedAt))}).{' '}
        {r.lastService
          ? `Último service registrado: ${r.lastService.odometer_km.toLocaleString('es-UY')} km.`
          : 'Todavía no registraste ningún service.'}{' '}
        Service cada 15.000 km o 12 meses; el primero a los 5.000 km.
      </p>
      {r.state !== 'ok' && (
        <Link to={draftLink(r, data.odometerKm)} className={styles.link}>
          Registrar service
        </Link>
      )}
    </Card>
  )
}
