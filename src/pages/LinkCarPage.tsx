import { FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Alert } from '../components/UI'
import VaultChecklist from '../components/VaultChecklist'
import { supabase } from '../lib/supabaseClient'
import {
  MAX_DEVICE_NAME_LENGTH,
  PAIRING_CODE_LENGTH,
  claimCarPairing,
  fetchMyVehicleMemberNames,
  hasLookalikeCharacters,
  isValidPairingCode,
  normalizePairingCode,
  type ClaimedDevice,
} from '../lib/carLink'
import styles from './LinkCarPage.module.css'
import formStyles from '../styles/formControls.module.css'

// "Vincular auto" (specs/car-link-phase0.md R3): the phone side of the
// TV-login style pairing. The car's QR opens #/mi-vigo/vincular?c=CODE;
// RequireAuth keeps the ?c= across the login detour.
export default function LinkCarPage() {
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState(() =>
    normalizePairingCode(searchParams.get('c') ?? '').slice(0, PAIRING_CODE_LENGTH)
  )
  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linked, setLinked] = useState<ClaimedDevice | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchMyVehicleMemberNames().then((names) => {
      if (!cancelled) setMembers(names)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const valid = isValidPairingCode(code)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const result = await claimCarPairing(code, name)
    setBusy(false)
    if (result.error || !result.device) {
      setError(result.error)
      return
    }
    setLinked(result.device)
  }

  return (
    <div>
      <PageHeader
        title="🔗 Vincular auto"
        subtitle="Conectá la pantalla de tu Vigo con tu vehículo en WikiVigo, sin escribir tu email en el auto."
      />

      <Card>
        <CardTitle>Código del auto</CardTitle>
        {!supabase && <Alert type="warning">La vinculación no está disponible en este momento.</Alert>}

        {linked ? (
          <div className={styles.done}>
            <Alert type="success">
              ¡Listo! <strong>{linked.name}</strong> quedó vinculado a tu vehículo. En unos segundos la
              pantalla del auto lo va a confirmar.
            </Alert>
            <Link to="/mi-vigo" className={styles.primaryLink}>
              Ver dispositivos vinculados
            </Link>
            {/* specs/vault-onboarding.md Phase B: the next steps instead of a dead end. */}
            <VaultChecklist />
          </div>
        ) : (
          <form className={formStyles.form} onSubmit={submit}>
            <p className={styles.steps}>
              En el auto, abrí <strong>Mi Vigo</strong> y tocá <strong>Vincular con WikiVigo</strong>. Escaneá
              el código QR con el teléfono o escribí acá el código de {PAIRING_CODE_LENGTH} caracteres que
              aparece en la pantalla. Vence a los 10 minutos.
            </p>

            {error && <Alert type="danger">{error}</Alert>}

            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="pairing-code">
                Código
              </label>
              <input
                id="pairing-code"
                type="text"
                className={`${formStyles.input} ${styles.codeInput}`}
                value={code}
                onChange={(e) => {
                  setCode(normalizePairingCode(e.target.value).slice(0, PAIRING_CODE_LENGTH))
                  setError(null)
                }}
                placeholder="K7Q2M9"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-describedby="pairing-code-hint"
              />
              <span id="pairing-code-hint" className={formStyles.hint}>
                {hasLookalikeCharacters(code)
                  ? 'El código del auto no usa las letras I, L ni O, ni los números 0 y 1. Revisalo en la pantalla.'
                  : 'Mayúsculas o minúsculas, da igual.'}
              </span>
            </div>

            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="pairing-name">
                Nombre del auto (opcional)
              </label>
              <input
                id="pairing-name"
                type="text"
                className={formStyles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vigo"
                maxLength={MAX_DEVICE_NAME_LENGTH}
              />
              <span className={formStyles.hint}>
                Así lo vas a ver en la lista de dispositivos vinculados.
              </span>
            </div>

            {members.length > 0 && (
              <p className={styles.target}>
                Se va a vincular al vehículo de: <strong>{members.join(', ')}</strong>
              </p>
            )}

            <button type="submit" className={styles.submitBtn} disabled={!valid || busy || !supabase}>
              {busy ? 'Vinculando…' : 'Vincular este auto'}
            </button>

            <p className={formStyles.hint}>
              El auto solo podrá enviar datos a este vehículo y nada se publica en la comunidad sin que lo
              confirmes desde tu teléfono. Podés desvincularlo cuando quieras en{' '}
              <Link to="/mi-vigo">Mi Vigo</Link>.
            </p>
          </form>
        )}
      </Card>
    </div>
  )
}
