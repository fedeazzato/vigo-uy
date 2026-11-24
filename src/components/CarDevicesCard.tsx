import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle, Alert } from './UI'
import { fetchCarDevices, formatTimestampDate, lastSeenLabel, revokeCarDevice } from '../lib/carLink'
import type { CarDevice } from '../types'
import styles from './CarDevicesCard.module.css'
import formStyles from '../styles/formControls.module.css'
import { confirmDialog } from '../lib/confirmDialog'

// "Dispositivos vinculados" (specs/car-link-phase0.md R4): the car head
// units linked to the member's vehicle. RLS returns only this vehicle's
// devices; revoking takes effect on the device's next call.
export default function CarDevicesCard() {
  const [devices, setDevices] = useState<CarDevice[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await fetchCarDevices()
    setDevices(result.devices)
    if (result.error) setError(result.error)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function revoke(device: CarDevice) {
    if (
      !(await confirmDialog(
        `¿Desconectar «${device.name}»? El auto deja de poder enviar datos a tu vehículo. Para volver a usarlo hay que conectar la pantalla de nuevo.`
      ))
    )
      return
    setBusyId(device.id)
    setError(null)
    setMessage(null)
    const result = await revokeCarDevice(device.id)
    setBusyId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setMessage(`«${device.name}» quedó desconectado.`)
    void load()
  }

  const now = new Date()

  return (
    <Card>
      <CardTitle icon="📲">Pantalla del auto conectada</CardTitle>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}
      {devices === null ? (
        <p className={formStyles.hint}>Cargando dispositivos…</p>
      ) : devices.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            Todavía no conectaste la pantalla de tu Vigo. En el auto, abrí <strong>Mi Vigo</strong> y tocá el botón
            de <strong>WikiVigo</strong>: vas a ver un código y un QR.
          </p>
          <Link to="/mi-vigo/vincular" className={styles.linkBtn}>
            Conectar la pantalla
          </Link>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {devices.map((d) => (
              <li key={d.id} className={`${styles.row} ${d.revoked_at ? styles.revoked : ''}`}>
                <span className={styles.info}>
                  <span className={styles.name}>{d.name}</span>
                  <span className={styles.meta}>
                    Conectado el {formatTimestampDate(d.created_at, now)}
                    {d.app_version && ` · Mi Vigo ${d.app_version}`}
                  </span>
                  <span className={styles.meta}>
                    {d.revoked_at
                      ? `Desconectado el ${formatTimestampDate(d.revoked_at, now)}`
                      : lastSeenLabel(d.last_seen_at, now)}
                  </span>
                </span>
                {!d.revoked_at && (
                  <button
                    type="button"
                    className={styles.revokeBtn}
                    onClick={() => void revoke(d)}
                    disabled={busyId !== null}
                  >
                    {busyId === d.id ? 'Desconectando…' : 'Desconectar'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className={formStyles.hint}>
            ¿Otro auto? <Link to="/mi-vigo/vincular">Conectar la pantalla</Link>
          </p>
        </>
      )}
    </Card>
  )
}
