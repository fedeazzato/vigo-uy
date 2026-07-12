import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, Alert } from './UI'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { fetchAuthorNames } from '../lib/communityData'
import type { Vehicle } from '../types'
import styles from './accountCards.module.css'
import formStyles from '../styles/formControls.module.css'

interface Member {
  id: string
  name: string
}

// Shared-vehicle management: members, optional private plate, and the two
// code flows — sharing YOUR code (others join you) vs entering SOMEONE
// ELSE'S code (you join them).
export default function VehicleCard() {
  const { user } = useAuth()

  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [plate, setPlate] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadVehicle = useCallback(async () => {
    if (!supabase || !user) return
    // RLS returns exactly the caller's vehicle and its member rows.
    const [vehicleRes, membersRes] = await Promise.all([
      supabase.from('vehicles').select('*').maybeSingle(),
      supabase.from('vehicle_members').select('user_id'),
    ])
    const v = (vehicleRes.data as Vehicle | null) ?? null
    setVehicle(v)
    setPlate(v?.plate ?? '')
    const ids = (membersRes.data ?? []).map((m: { user_id: string }) => m.user_id)
    const names = await fetchAuthorNames(ids)
    setMembers(ids.map((id) => ({ id, name: names[id] ?? 'un usuario' })))
  }, [user])

  useEffect(() => {
    loadVehicle()
  }, [loadVehicle])

  async function run(action: () => Promise<{ error: { message: string } | null }>, successMsg: string) {
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: actionError } = await action()
    setBusy(false)
    if (actionError) {
      setError(toFriendlyError(actionError))
      return
    }
    setMessage(successMsg)
    loadVehicle()
  }

  async function savePlate() {
    if (!vehicle) return
    run(
      () => supabase!.from('vehicles').update({ plate: plate.trim() || null }).eq('id', vehicle.id),
      'Matrícula guardada.'
    )
  }

  async function copyJoinCode() {
    if (!vehicle) return
    await navigator.clipboard.writeText(vehicle.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function joinVehicle(e: FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return
    if (!confirm('Vas a dejar tu vehículo actual y unirte al de otra persona. ¿Continuar?')) return
    await run(
      () => supabase!.rpc('join_vehicle_by_code', { code: joinCode.trim() }),
      'Ahora compartís vehículo con ese grupo.'
    )
    setJoinCode('')
  }

  async function resetVehicle() {
    if (!confirm('Vas a dejar el vehículo compartido y volver a uno propio. ¿Continuar?')) return
    run(() => supabase!.rpc('reset_my_vehicle'), 'Volviste a tu propio vehículo.')
  }

  async function removeMember(member: Member) {
    if (!confirm(`¿Quitar a ${member.name} del vehículo? Va a quedar con un vehículo propio.`)) return
    run(
      () => supabase!.rpc('remove_vehicle_member', { target_user: member.id }),
      `${member.name} ya no integra tu vehículo.`
    )
  }

  const isCreator = Boolean(user && vehicle && vehicle.created_by === user.id)

  return (
    <Card>
      <CardTitle icon="🚗">Mi vehículo</CardTitle>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}
      {!vehicle ? (
        <p className={styles.hint}>Cargando datos del vehículo…</p>
      ) : (
        <div className={styles.form}>
          <div className={styles.field}>
            <span className={styles.label}>Integrantes</span>
            <ul className={styles.memberList}>
              {members.map((m) => (
                <li key={m.id} className={styles.memberRow}>
                  <span>
                    {m.name}
                    {m.id === user?.id && <span className={styles.memberTag}> (vos)</span>}
                    {m.id === vehicle.created_by && <span className={styles.memberTag}> · creador</span>}
                  </span>
                  {isCreator && m.id !== user?.id && (
                    <button
                      type="button"
                      className={styles.removeLink}
                      onClick={() => removeMember(m)}
                      disabled={busy}
                    >
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="vehicle-plate">Matrícula (opcional)</label>
            <div className={styles.inlineRow}>
              <input
                id="vehicle-plate"
                type="text"
                className={formStyles.input}
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="ABC 1234"
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={savePlate}
                disabled={busy || plate.trim() === (vehicle.plate ?? '')}
              >
                Guardar
              </button>
            </div>
            <span className={styles.hint}>
              Solo la ven los integrantes de tu vehículo. Nunca se muestra en la comunidad.
            </span>
          </div>

          <div className={styles.block}>
            <span className={styles.blockTitle}>Invitá a quienes comparten tu Vigo</span>
            <p className={styles.blockText}>
              ¿Manejan el mismo auto en familia? Pasales este código: al ingresarlo se suman a este
              vehículo y los kilómetros de todos cuentan juntos en el ranking.
            </p>
            <div className={styles.inlineRow}>
              <code className={styles.joinCode}>{vehicle.join_code}</code>
              <button type="button" className={styles.secondaryBtn} onClick={copyJoinCode}>
                {copied ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>
          </div>

          <form className={styles.block} onSubmit={joinVehicle}>
            <span className={styles.blockTitle}>¿Te pasaron un código?</span>
            <p className={styles.blockText}>
              Ingresalo acá para unirte al vehículo de otra persona. Vas a dejar tu vehículo actual y
              tus próximos viajes van a sumar al vehículo compartido.
            </p>
            <div className={styles.inlineRow}>
              <input
                id="join-code"
                type="text"
                className={formStyles.input}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Código de 6 letras"
              />
              <button type="submit" className={styles.secondaryBtn} disabled={busy || !joinCode.trim()}>
                Unirme
              </button>
            </div>
          </form>

          {user && vehicle.created_by !== user.id && (
            <div className={styles.block}>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={resetVehicle}
                disabled={busy}
              >
                Volver a mi propio vehículo
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
