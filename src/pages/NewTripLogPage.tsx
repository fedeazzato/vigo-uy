import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, FormError, Skeleton } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { useUserPrefs, MODELS } from '../context/UserPrefsContext'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { parseLocaleNumber } from '../lib/format'
import { fetchChargingNetworks, fetchChargingStations, invalidateCommunityCache } from '../lib/communityData'
import { useMediaQuery, MOBILE_QUERY } from '../lib/useMediaQuery'
import type { ChargingNetwork, ChargingStation, TripChargingStop, Model } from '../types'
import CityDatalist, { UY_CITIES_LIST_ID } from '../components/CityDatalist'
import styles from './NewTripLogPage.module.css'
import formStyles from '../styles/formControls.module.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// The form is a 3-step wizard (mobile redesign): short screens beat one long
// scroll. Step 1 holds the required basics, everything after is optional.
const STEP_TITLES: Record<number, string> = {
  1: 'Lo básico',
  2: '¿Cómo estuvo?',
  3: 'Compartir',
}
const LAST_STEP = 3

// Form state keeps every value as a string; numbers are parsed only on
// submit.
export interface StopDraft {
  name: string
  note: string
  distanceFromPrevious: string
  arrivalPercentage: string
  departurePercentage: string
  durationMinutes: string
  averageSpeed: string
  cost: string
  energyKwh: string
  stationId: string
}

function emptyStop(): StopDraft {
  return {
    name: '',
    note: '',
    distanceFromPrevious: '',
    arrivalPercentage: '',
    departurePercentage: '',
    durationMinutes: '',
    averageSpeed: '',
    cost: '',
    energyKwh: '',
    stationId: '',
  }
}

function stopToDraft(stop: TripChargingStop): StopDraft {
  return {
    name: stop.name,
    note: stop.note ?? '',
    distanceFromPrevious: stop.distance_from_previous_km != null ? String(stop.distance_from_previous_km) : '',
    arrivalPercentage: stop.arrival_percentage != null ? String(stop.arrival_percentage) : '',
    departurePercentage: stop.departure_percentage != null ? String(stop.departure_percentage) : '',
    durationMinutes: stop.duration_minutes != null ? String(stop.duration_minutes) : '',
    averageSpeed: stop.average_speed_kmh != null ? String(stop.average_speed_kmh) : '',
    cost: stop.cost_uyu != null ? String(stop.cost_uyu) : '',
    energyKwh: stop.energy_kwh != null ? String(stop.energy_kwh) : '',
    stationId: stop.station_id ?? '',
  }
}

function isValidNonNegative(n: number | undefined): boolean {
  return n === undefined || n >= 0
}

function isValidPercentage(n: number | undefined): boolean {
  return n === undefined || (n >= 0 && n <= 100)
}

// Converts the string drafts into the charging_stops jsonb payload,
// validating as it goes. Stops without a name are skipped. Exported for
// tests: this is the exact shape sent to the database.
export function parseStopDrafts(
  stops: StopDraft[]
): { stops: TripChargingStop[] } | { error: string } {
  const cleanStops: TripChargingStop[] = []
  for (const s of stops) {
    if (!s.name.trim()) continue
    const arrival = parseLocaleNumber(s.arrivalPercentage)
    const departure = parseLocaleNumber(s.departurePercentage)
    if (!isValidPercentage(arrival) || !isValidPercentage(departure)) {
      return { error: 'Los porcentajes de batería en las paradas deben estar entre 0 y 100.' }
    }
    const stopSpeed = parseLocaleNumber(s.averageSpeed)
    if (!isValidNonNegative(stopSpeed)) {
      return { error: 'La velocidad media entre paradas debe ser un número válido.' }
    }
    const cost = parseLocaleNumber(s.cost)
    if (!isValidNonNegative(cost)) {
      return { error: 'El costo de la carga debe ser un número válido.' }
    }
    const energy = parseLocaleNumber(s.energyKwh)
    if (energy !== undefined && !(energy > 0)) {
      return { error: 'La energía cargada (kWh) debe ser mayor a cero.' }
    }
    const stop: TripChargingStop = { name: s.name.trim() }
    if (s.note.trim()) stop.note = s.note.trim()
    const distanceFromPrevious = parseLocaleNumber(s.distanceFromPrevious)
    if (!isValidNonNegative(distanceFromPrevious)) {
      return { error: 'La distancia entre paradas debe ser un número válido.' }
    }
    if (distanceFromPrevious !== undefined) stop.distance_from_previous_km = distanceFromPrevious
    if (arrival !== undefined) stop.arrival_percentage = arrival
    if (departure !== undefined) stop.departure_percentage = departure
    const duration = parseLocaleNumber(s.durationMinutes)
    if (!isValidNonNegative(duration)) {
      return { error: 'Los minutos de carga deben ser un número válido.' }
    }
    if (duration !== undefined) stop.duration_minutes = duration
    if (stopSpeed !== undefined) stop.average_speed_kmh = stopSpeed
    if (cost !== undefined) stop.cost_uyu = cost
    if (energy !== undefined) stop.energy_kwh = energy
    if (s.stationId) stop.station_id = s.stationId
    cleanStops.push(stop)
  }
  return { stops: cleanStops }
}

export default function NewTripLogPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const { model: preferredModel } = useUserPrefs()
  const navigate = useNavigate()

  // The 3-step wizard exists to shorten phone screens; on desktop the same
  // form renders as a single page (plan: phase 2, item 2).
  const isWizard = useMediaQuery(MOBILE_QUERY)
  const [step, setStep] = useState(1)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [tripDate, setTripDate] = useState(today())
  const [model, setModel] = useState<Model | ''>(() => (isEdit ? '' : preferredModel ?? ''))
  const [startingCharge, setStartingCharge] = useState('')
  const [endingCharge, setEndingCharge] = useState('')
  const [averageSpeed, setAverageSpeed] = useState('')
  const [stops, setStops] = useState<StopDraft[]>([])
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  // Battery/charge fields are power-user detail, collapsed by default so the
  // form isn't a wall of optional numbers on a phone.
  const [showDetails, setShowDetails] = useState(false)

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stations, setStations] = useState<ChargingStation[]>([])
  const [networks, setNetworks] = useState<ChargingNetwork[]>([])
  // Any change flips this on; Cancel then asks before discarding.
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!supabase) return
    fetchChargingStations().then(({ stations: s }) => setStations(s))
    fetchChargingNetworks().then(({ networks: n }) => setNetworks(n))
  }, [])

  // The free-text name is hidden while a station is selected, so it must
  // mirror the station's name (the name is what makes a stop count in the
  // payload). Deselecting clears it for the user to type their own.
  function setStopStation(index: number, stationId: string) {
    const station = stations.find((s) => s.id === stationId)
    setStops((prev) =>
      prev.map((s, i) => (i === index ? { ...s, stationId, name: station?.name ?? '' } : s))
    )
    setDirty(true)
  }

  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('trip_logs')
      .select('*')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No se pudo cargar el viaje.')
        } else {
          setOrigin(data.origin)
          setDestination(data.destination)
          setDistanceKm(data.distance_km != null ? String(data.distance_km) : '')
          setTripDate(data.trip_date)
          setModel((data.model as Model | null) ?? '')
          setStartingCharge(data.starting_charge_percentage != null ? String(data.starting_charge_percentage) : '')
          setEndingCharge(data.ending_charge_percentage != null ? String(data.ending_charge_percentage) : '')
          setAverageSpeed(data.average_speed_kmh != null ? String(data.average_speed_kmh) : '')
          const loadedStops = ((data.charging_stops ?? []) as TripChargingStop[]).map(stopToDraft)
          setStops(loadedStops)
          setRating(data.rating)
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
          // Expand the collapsed section when it already holds data,
          // otherwise the user can't see what they saved.
          setShowDetails(
            data.starting_charge_percentage != null ||
              data.ending_charge_percentage != null ||
              data.average_speed_kmh != null ||
              loadedStops.length > 0
          )
        }
        setLoading(false)
      })
  }, [id, isEdit])

  function addStop() {
    setStops((prev) => [...prev, emptyStop()])
    setDirty(true)
  }

  function updateStop(index: number, field: keyof StopDraft, value: string) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  function handleCancel() {
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return
    navigate('/mi-actividad')
  }

  // "← Atrás": previous step, or leave the form from step 1.
  function handleBack() {
    if (step > 1) {
      setStep((s) => s - 1)
      setError(null)
      return
    }
    handleCancel()
  }

  // Step 1 fields are validated when leaving the step, so later steps never
  // fail on a field that's no longer on screen.
  function validateBasics(): string | null {
    if (!origin.trim() || !destination.trim() || !distanceKm.trim()) {
      return 'Completá origen, destino y distancia.'
    }
    const distance = parseLocaleNumber(distanceKm)
    if (distance === undefined || !Number.isFinite(distance) || distance < 0) {
      return 'La distancia debe ser un número válido.'
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Wizard mode: steps 1 and 2 only advance; the trip is saved from the
    // last step. Desktop renders everything at once and submits directly.
    if (isWizard && step < LAST_STEP) {
      if (step === 1) {
        const basicsError = validateBasics()
        if (basicsError) {
          setError(basicsError)
          return
        }
      }
      setError(null)
      setStep((s) => s + 1)
      return
    }

    const basicsError = validateBasics()
    if (basicsError) {
      setError(basicsError)
      if (isWizard) setStep(1)
      return
    }
    if (isPublic && !model) {
      setError('Seleccioná el modelo (E2 o E2+) para compartir con la comunidad.')
      return
    }

    if (!supabase || !user) return
    const distance = parseLocaleNumber(distanceKm) ?? null
    const startCharge = parseLocaleNumber(startingCharge)
    if (!isValidPercentage(startCharge)) {
      setError('La batería al salir debe estar entre 0 y 100.')
      return
    }
    const endCharge = parseLocaleNumber(endingCharge)
    if (!isValidPercentage(endCharge)) {
      setError('La batería al llegar debe estar entre 0 y 100.')
      return
    }
    const avgSpeed = parseLocaleNumber(averageSpeed)
    if (!isValidNonNegative(avgSpeed)) {
      setError('La velocidad media debe ser un número válido.')
      return
    }

    const parsed = parseStopDrafts(stops)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    const cleanStops = parsed.stops

    setSubmitting(true)
    setError(null)

    const payload = {
      // The title is derived, not asked for: nobody knows what to "title" a
      // trip, and origin/destination already say it all.
      title: `${origin.trim()} - ${destination.trim()}`,
      origin: origin.trim(),
      destination: destination.trim(),
      distance_km: distance,
      trip_date: tripDate,
      model: model || null,
      starting_charge_percentage: startCharge ?? null,
      ending_charge_percentage: endCharge ?? null,
      average_speed_kmh: avgSpeed ?? null,
      charging_stops: cleanStops,
      rating,
      notes: notes.trim() || null,
      is_public: isPublic,
    }

    const { error } = isEdit
      ? await supabase.from('trip_logs').update(payload).eq('id', id!)
      : await supabase.from('trip_logs').insert({ ...payload, user_id: user.id })

    setSubmitting(false)

    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    navigate('/mi-actividad', { state: { saved: 'viaje' } })
  }

  // Edit mode: show the header + a skeleton instead of a blank screen while
  // the trip being edited loads.
  if (loading) {
    return (
      <div>
        <PageHeader
          title={isEdit ? '🗺️ Editar viaje' : '🗺️ Nuevo viaje'}
          subtitle="Registrá un viaje y tus paradas de carga para compartir con la comunidad."
        />
        <Skeleton lines={8} />
      </div>
    )
  }

  return (
    <div>
      <div className={styles.wizardTop}>
        {isWizard ? (
          <>
            <button type="button" className={styles.backBtn} onClick={handleBack} disabled={submitting}>
              ← Atrás
            </button>
            <span className={styles.stepCounter}>Paso {step} de {LAST_STEP}</span>
          </>
        ) : (
          <button type="button" className={styles.backBtn} onClick={handleCancel} disabled={submitting}>
            ← Volver
          </button>
        )}
      </div>
      {isWizard ? (
        <PageHeader
          title={`🗺️ ${STEP_TITLES[step]}`}
          subtitle={isEdit ? 'Estás editando un viaje guardado.' : undefined}
        />
      ) : (
        <PageHeader
          title={isEdit ? '🗺️ Editar viaje' : '🗺️ Nuevo viaje'}
          subtitle="Registrá un viaje y tus paradas de carga para compartir con la comunidad."
        />
      )}

      <Card>
        {error && <FormError>{error}</FormError>}

        <form className={styles.form} onSubmit={handleSubmit} onChange={() => setDirty(true)}>
          {(!isWizard || step === 1) && (
          <>
          <CityDatalist />
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-origin">📍 Origen</label>
              <input
                id="trip-origin"
                required
                type="text"
                list={UY_CITIES_LIST_ID}
                className={formStyles.input}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Montevideo"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-destination">🏁 Destino</label>
              <input
                id="trip-destination"
                required
                type="text"
                list={UY_CITIES_LIST_ID}
                className={formStyles.input}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Punta del Este"
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-date">📅 Fecha</label>
              <input
                id="trip-date"
                required
                type="date"
                className={formStyles.input}
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-distance">📏 Distancia (km)</label>
              <input
                id="trip-distance"
                required
                type="text"
                inputMode="numeric"
                className={formStyles.input}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="140"
              />
            </div>
          </div>
          </>
          )}

          {(!isWizard || step === 3) && (
          <>
          <div className={styles.shareBlock}>
            <div className={styles.field}>
              <span className={styles.label}>
                🚙 Modelo
              </span>
              <div className={styles.modelRow}>
                {MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.modelBtn} ${model === m ? styles.modelBtnSelected : ''}`}
                    onClick={() => { setModel(m); setDirty(true) }}
                    aria-pressed={model === m}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {isPublic && !model && (
                <span className={styles.modelHint}>
                  Elegí E2 o E2+ para poder compartir el viaje con la comunidad.
                </span>
              )}
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Compartir con la comunidad (se muestra sin tu email, solo tu nombre)
            </label>
          </div>

          <button
            type="button"
            className={styles.disclosureBtn}
            onClick={() => setShowDetails((o) => !o)}
            aria-expanded={showDetails}
          >
            {showDetails
              ? 'Ocultar detalles de batería y carga ▴'
              : 'Agregar detalles de batería y carga ▾'}
          </button>

          {showDetails && (
            <div className={styles.detailsSection}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="trip-starting-charge">🔋 Batería al salir (%)</label>
                  <input
                    id="trip-starting-charge"
                    type="text"
                    inputMode="numeric"
                    className={formStyles.input}
                    value={startingCharge}
                    onChange={(e) => setStartingCharge(e.target.value)}
                    placeholder="90"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="trip-ending-charge">🪫 Batería al llegar (%)</label>
                  <input
                    id="trip-ending-charge"
                    type="text"
                    inputMode="numeric"
                    className={formStyles.input}
                    value={endingCharge}
                    onChange={(e) => setEndingCharge(e.target.value)}
                    placeholder="15"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="trip-avg-speed">⏱️ Velocidad media del viaje (km/h)</label>
                <input
                  id="trip-avg-speed"
                  type="text"
                  inputMode="decimal"
                  className={formStyles.input}
                  value={averageSpeed}
                  onChange={(e) => setAverageSpeed(e.target.value)}
                  placeholder="95"
                />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>⚡ Paradas de carga</span>
                {stops.length === 0 && <p className={styles.emptyStops}>Sin paradas registradas.</p>}
                <div className={styles.stopsList}>
                  {stops.map((stop, index) => (
                    <div key={index} className={styles.stopCard}>
                      <div className={styles.stopHeader}>
                        <span className={styles.stopHeaderLabel}>Parada {index + 1}</span>
                        <button
                          type="button"
                          className={styles.removeStopBtn}
                          onClick={() => removeStop(index)}
                        >
                          Quitar
                        </button>
                      </div>

                      {stations.length > 0 && (
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-station`}>🔌 Cargador</label>
                          <select
                            id={`stop-${index}-station`}
                            aria-label="Cargador"
                            className={formStyles.input}
                            value={stop.stationId}
                            onChange={(e) => setStopStation(index, e.target.value)}
                          >
                            <option value="">No está en la lista</option>
                            {networks.map((net) => {
                              const options = stations.filter((s) => s.network === net.slug)
                              if (options.length === 0) return null
                              return (
                                <optgroup key={net.slug} label={net.name}>
                                  {options.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}{s.city ? ` — ${s.city}` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              )
                            })}
                          </select>
                        </div>
                      )}

                      <div className={styles.stopMainRow}>
                        {!stop.stationId && (
                          <div className={styles.field}>
                            <label className={styles.smallLabel} htmlFor={`stop-${index}-name`}>Nombre del cargador</label>
                            <input
                              id={`stop-${index}-name`}
                              type="text"
                              className={formStyles.input}
                              value={stop.name}
                              onChange={(e) => updateStop(index, 'name', e.target.value)}
                              placeholder="Nombre del cargador"
                            />
                          </div>
                        )}
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-duration`}>⏳ Minutos cargando</label>
                          <input
                            id={`stop-${index}-duration`}
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.durationMinutes}
                            onChange={(e) => updateStop(index, 'durationMinutes', e.target.value)}
                            placeholder="35"
                          />
                        </div>
                      </div>

                      <div className={styles.stopMainRow}>
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-distance`}>Distancia desde la parada anterior (km)</label>
                          <input
                            id={`stop-${index}-distance`}
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.distanceFromPrevious}
                            onChange={(e) => updateStop(index, 'distanceFromPrevious', e.target.value)}
                            placeholder="80"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-speed`}>Velocidad media hasta acá (km/h)</label>
                          <input
                            id={`stop-${index}-speed`}
                            type="text"
                            inputMode="decimal"
                            className={formStyles.input}
                            value={stop.averageSpeed}
                            onChange={(e) => updateStop(index, 'averageSpeed', e.target.value)}
                            placeholder="90"
                          />
                        </div>
                      </div>

                      <div className={styles.stopMainRow}>
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-arrival`}>% al llegar</label>
                          <input
                            id={`stop-${index}-arrival`}
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.arrivalPercentage}
                            onChange={(e) => updateStop(index, 'arrivalPercentage', e.target.value)}
                            placeholder="20"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-departure`}>% al salir</label>
                          <input
                            id={`stop-${index}-departure`}
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.departurePercentage}
                            onChange={(e) => updateStop(index, 'departurePercentage', e.target.value)}
                            placeholder="80"
                          />
                        </div>
                      </div>

                      <div className={styles.stopMainRow}>
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-cost`}>💰 Costo de la carga (UYU)</label>
                          <input
                            id={`stop-${index}-cost`}
                            type="text"
                            inputMode="decimal"
                            className={formStyles.input}
                            value={stop.cost}
                            onChange={(e) => updateStop(index, 'cost', e.target.value)}
                            placeholder="450"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.smallLabel} htmlFor={`stop-${index}-energy`}>🔌 Energía cargada (kWh, según el cargador)</label>
                          <input
                            id={`stop-${index}-energy`}
                            type="text"
                            inputMode="decimal"
                            className={formStyles.input}
                            value={stop.energyKwh}
                            onChange={(e) => updateStop(index, 'energyKwh', e.target.value)}
                            placeholder="28,5"
                          />
                        </div>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.smallLabel} htmlFor={`stop-${index}-note`}>💬 Nota</label>
                        <textarea
                          id={`stop-${index}-note`}
                          rows={3}
                          className={`${formStyles.input} ${formStyles.textarea}`}
                          value={stop.note}
                          onChange={(e) => updateStop(index, 'note', e.target.value)}
                          placeholder="Detalles de esta parada..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className={styles.addStopBtn} onClick={addStop}>
                  + Agregar parada
                </button>
              </div>
            </div>
          )}
          </>
          )}

          {(!isWizard || step === 2) && (
          <>
          <div className={styles.field}>
            <span className={styles.label}>⭐ ¿Cómo estuvo el viaje?</span>
            <div className={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.starBtn} ${rating != null && n <= rating ? styles.filled : ''}`}
                  onClick={() => { setRating(rating === n ? null : n); setDirty(true) }}
                  aria-label={`${n} estrellas`}
                  aria-pressed={rating != null && n <= rating}
                >
                  ★
                </button>
              ))}
              {rating != null && (
                <button
                  type="button"
                  className={styles.clearRating}
                  onClick={() => { setRating(null); setDirty(true) }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="trip-notes">💬 Notas</label>
            <textarea
              id="trip-notes"
              rows={3}
              className={`${formStyles.input} ${formStyles.textarea}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contanos cómo te fue..."
            />
          </div>
          </>
          )}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {isWizard && step < LAST_STEP
              ? 'Siguiente'
              : submitting
                ? 'Guardando…'
                : isEdit
                  ? 'Guardar cambios'
                  : 'Guardar viaje'}
          </button>
        </form>
      </Card>
    </div>
  )
}
