// A8 "Firmware tracker" (specs/car-firmware-a8.md R4): the community table of head-unit software versions seen on linked cars
// (anonymous aggregate) and, for a signed-in member whose car reported its version, "¿Hay una versión más nueva?". Hidden
// while nothing has been reported (or before migration 0056 is applied).
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  fetchFirmwareVersions,
  fetchOwnFirmware,
  monthLabel,
  newerThan,
  parseFirmware,
  type FirmwareVersionRow,
} from '../lib/carFirmware'
import { Card, CardTitle } from './UI'
import styles from './FirmwareCard.module.css'

function buildDateLabel(name: string): string {
  const d = parseFirmware(name).buildDate
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function FirmwareCard() {
  const { status } = useAuth()
  const [rows, setRows] = useState<FirmwareVersionRow[] | null>(null)
  const [mine, setMine] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetchFirmwareVersions().then((r) => {
      if (alive) setRows(r)
    })
    if (status === 'signedIn') {
      void fetchOwnFirmware().then((v) => {
        if (alive) setMine(v)
      })
    }
    return () => {
      alive = false
    }
  }, [status])

  if (!rows || (rows.length === 0 && !mine)) return null
  const newer = mine ? newerThan(mine, rows) : null

  return (
    <Card>
      <CardTitle icon="🧩">Versiones de software de la pantalla</CardTitle>
      <p className={styles.note}>
        ¿Tu pantalla está al día? Comparamos con los otros autos conectados (sin decir de quién es cada
        uno). En Uruguay la pantalla la actualiza el concesionario.
      </p>
      {mine && (
        <div className={styles.own} role="status">
          <p className={styles.big}>¿Hay una versión más nueva?</p>
          {newer ? (
            <>
              Sí: <span className={styles.version}>{newer.fw_version}</span> (vista en {newer.cars}{' '}
              {newer.cars === 1 ? 'auto' : 'autos'}). Tu auto tiene{' '}
              <span className={styles.version}>{mine}</span>. Pedila en el service.
            </>
          ) : parseFirmware(mine).version === null ? (
            <>
              Tu auto tiene <span className={styles.version}>{mine}</span>; no sabemos compararla con las
              demás.
            </>
          ) : (
            <>
              No, tu auto tiene la más nueva que vio la comunidad:{' '}
              <span className={styles.version}>{mine}</span>.
            </>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Versión</th>
                <th>Compilada</th>
                <th>Autos</th>
                <th>Vista por última vez</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.fw_version} className={r.fw_version === mine ? styles.mine : undefined}>
                  <td className={styles.version}>
                    {r.fw_version}
                    {r.fw_version === mine ? ' (tu auto)' : ''}
                  </td>
                  <td>{buildDateLabel(r.fw_version)}</td>
                  <td>{r.cars}</td>
                  <td>{monthLabel(r.last_seen_month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
