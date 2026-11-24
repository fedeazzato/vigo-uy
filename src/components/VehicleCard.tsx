import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, Alert } from './UI'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { fetchAuthorNames } from '../lib/communityData'
import type { Vehicle } from '../types'
import { canControl, fetchMyCarRole, ROLE_LABELS, setMemberCarRole, type CarRole, type MemberCarRole } from '../lib/carRole'
import { createFamilyInvite, formatInviteCode, INVITE_TTL_HOURS, inviteShareText, type FamilyInvite } from '../lib/familyInvite'
import styles from './accountCards.module.css'
import formStyles from '../styles/formControls.module.css'
import { confirmDialog } from '../lib/confirmDialog'

interface Member {
  id: string
  name: string
  /** E2 (0070); null before the migration is applied */
  role: MemberCarRole | null
}

type MemberRow = { user_id: string; car_role?: string | null }

// car_role exists only after migration 0070: fall back to user_id alone so the card keeps working before it is applied.
async function fetchMemberRows(): Promise<MemberRow[]> {
  if (!supabase) return []
  const withRole = await supabase.from('vehicle_members').select('user_id, car_role')
  if (!withRole.error) return withRole.data ?? []
  const plain = await supabase.from('vehicle_members').select('user_id')
  return (plain.data ?? [])
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
  // One-time invite (0082): never shown by default; each tap on "Sumar a tu familia" makes a new one.
  const [invite, setInvite] = useState<FamilyInvite | null>(null)
  const [myRole, setMyRole] = useState<CarRole | null>(null)

  useEffect(() => {
    void fetchMyCarRole().then(setMyRole)
  }, [])

  const loadVehicle = useCallback(async () => {
    if (!supabase || !user) return
    // RLS returns exactly the caller's vehicle and its member rows.
    const [vehicleRes, membersRes] = await Promise.all([
      supabase.from('vehicles').select('*').maybeSingle(),
      fetchMemberRows(),
    ])
    const v = (vehicleRes.data as Vehicle | null) ?? null
    setVehicle(v)
    setPlate(v?.plate ?? '')
    const ids = membersRes.map((m) => m.user_id)
    const names = await fetchAuthorNames(ids)
    setMembers(
      membersRes.map((m) => ({
        id: m.user_id,
        name: names[m.user_id] ?? 'un usuario',
        role: m.car_role === 'control' || m.car_role === 'view' ? m.car_role : null,
      }))
    )
  }, [user])

  useEffect(() => {
    void loadVehicle()
  }, [loadVehicle])

  // PromiseLike, not Promise: supabase query builders are thenables.
  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, successMsg: string) {
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
    void loadVehicle()
  }

  function savePlate() {
    if (!vehicle) return
    void run(
      () =>
        supabase!
          .from('vehicles')
          .update({ plate: plate.trim() || null })
          .eq('id', vehicle.id),
      'Matrícula guardada.'
    )
  }

  async function newInvite() {
    setBusy(true)
    setError(null)
    setMessage(null)
    setCopied(false)
    const result = await createFamilyInvite()
    setBusy(false)
    if (result.error) setError(result.error)
    setInvite(result.invite)
  }

  async function copyInvite() {
    if (!invite) return
    await navigator.clipboard.writeText(invite.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareInvite() {
    if (!invite) return
    const text = inviteShareText(invite.code)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
      } catch {
        // cancelled by the user
      }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  async function joinVehicle(e: FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return
    if (!(await confirmDialog('Vas a dejar tu vehículo actual y sumarte al de otra persona. ¿Continuar?'))) return
    await run(async () => {
      const { data, error } = await supabase!.rpc('join_vehicle_by_code', { code: joinCode.trim() })
      if (error) return { error }
      // An invalid code returns null instead of raising, so the server can
      // record the failed attempt for rate limiting (migration 0021).
      if (!data) return { error: { message: 'Código no válido.' } }
      return { error: null }
    }, 'Listo, ya compartís el vehículo con tu familia.')
    setJoinCode('')
  }

  async function resetVehicle() {
    if (!(await confirmDialog('Vas a dejar el vehículo compartido y volver a uno propio. ¿Continuar?'))) return
    void run(() => supabase!.rpc('reset_my_vehicle'), 'Volviste a tu propio vehículo.')
  }

  async function removeMember(member: Member) {
    if (!(await confirmDialog(`¿Quitar a ${member.name} del vehículo? Va a quedar con un vehículo propio.`))) return
    void run(
      () => supabase!.rpc('remove_vehicle_member', { target_user: member.id }),
      `${member.name} ya no integra tu vehículo.`
    )
  }

  function changeRole(member: Member, role: MemberCarRole) {
    void run(async () => {
      const r = await setMemberCarRole(member.id, role)
      return { error: r.error ? { message: r.error } : null }
    }, `${member.name}: ${ROLE_LABELS[role].toLowerCase()}.`)
  }

  const isCreator = Boolean(user && vehicle && vehicle.created_by === user.id)

  return (
    <Card>
      <CardTitle icon="🚗">Mi vehículo</CardTitle>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}
      {!vehicle ? (
        <p className={formStyles.hint}>Cargando datos del vehículo…</p>
      ) : (
        <div className={formStyles.form}>
          <div className={formStyles.field}>
            <span className={formStyles.label}>Integrantes</span>
            <ul className={styles.memberList}>
              {members.map((m) => (
                <li key={m.id} className={styles.memberRow}>
                  <span>
                    {m.name}
                    {m.id === user?.id && <span className={styles.memberTag}> (vos)</span>}
                    {m.id === vehicle.created_by && <span className={styles.memberTag}> · creador</span>}
                  </span>
                  {isCreator && m.id !== user?.id && m.role && (
                    <select
                      aria-label={`Permiso de ${m.name}`}
                      className={formStyles.input}
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value as MemberCarRole)}
                      disabled={busy}
                    >
                      <option value="view">{ROLE_LABELS.view}</option>
                      <option value="control">{ROLE_LABELS.control}</option>
                    </select>
                  )}
                  {!isCreator && m.id === user?.id && m.role && (
                    <span className={styles.memberTag}> · {ROLE_LABELS[m.role].toLowerCase()}</span>
                  )}
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

          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="vehicle-plate">
              🚘 Matrícula
            </label>
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
            <span className={formStyles.hint}>
              Solo la ven los integrantes de tu vehículo. Nunca se muestra en la comunidad.
            </span>
          </div>

          <div className={styles.block}>
            <span className={styles.blockTitle}>Sumar a tu familia</span>
            <p className={styles.blockText}>
              ¿Manejan el mismo auto en familia? Creá un código y pasáselo a una persona: al escribirlo se suma a
              este vehículo y los kilómetros de todos cuentan juntos. Ve el estado del auto y los avisos; para
              mandarle órdenes, dale permiso de control en la lista de arriba.
            </p>
            {canControl(myRole) ? (
              <>
                {invite && (
                  <div className={styles.invite} role="status">
                    <code className={styles.joinCode} aria-label={`Código ${invite.code.split('').join(' ')}`}>
                      {formatInviteCode(invite.code)}
                    </code>
                    <p className={styles.blockText}>
                      Vence en {INVITE_TTL_HOURS} h, sirve para una persona. Si creás otro, este deja de servir.
                    </p>
                    <div className={styles.buttonRow}>
                      <button type="button" className={styles.secondaryBtn} onClick={() => void copyInvite()}>
                        {copied ? 'Copiado ✓' : 'Copiar'}
                      </button>
                      <button type="button" className={styles.secondaryBtn} onClick={() => void shareInvite()}>
                        Compartir
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => void newInvite()}
                  disabled={busy}
                >
                  {invite ? 'Crear otro código (el anterior deja de servir)' : 'Sumar a tu familia'}
                </button>
              </>
            ) : (
              <p className={formStyles.hint}>
                Pedile el código a quien creó el vehículo o a alguien con permiso de control.
              </p>
            )}
          </div>

          <form className={styles.block} onSubmit={joinVehicle}>
            <span className={styles.blockTitle}>¿Te pasaron un código?</span>
            <p className={styles.blockText}>
              Escribilo acá para sumarte al vehículo de otra persona. Vas a dejar tu vehículo actual y tus
              próximos viajes van a sumar al vehículo compartido.
            </p>
            <div className={styles.inlineRow}>
              <input
                id="join-code"
                type="text"
                className={formStyles.input}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Código de 8 caracteres"
                aria-label="Código para sumarte"
                autoComplete="off"
              />
              <button type="submit" className={styles.secondaryBtn} disabled={busy || !joinCode.trim()}>
                Sumarme
              </button>
            </div>
          </form>

          {user && vehicle.created_by !== user.id && (
            <div className={styles.block}>
              <button type="button" className={styles.dangerBtn} onClick={resetVehicle} disabled={busy}>
                Volver a mi propio vehículo
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
