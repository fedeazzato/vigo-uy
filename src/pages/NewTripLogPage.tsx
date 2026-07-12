import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, Alert, Skeleton } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { useUserPrefs, MODELS } from '../context/UserPrefsContext'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { invalidateCommunityCache } from '../lib/communityData'
import type { TripChargingStop, Model } from '../types'
import styles from './NewTripLogPage.module.css'
import formStyles from '../styles/formControls.module.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// Form state keeps every value as a string; numbers are parsed only on
// submit.
interface StopDraft {
  name: string
  note: string
  distanceFromPrevious: string
  arrivalPercentage: string
  departurePercentage: string
  durationMinutes: string
  averageSpeed: string
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
  }
}

function isValidNonNegative(n: number | undefined): boolean {
  return n === undefined || n >= 0
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

function isValidPercentage(n: number | undefined): boolean {
  return n === undefined || (n >= 0 && n <= 100)
}

export default function NewTripLogPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const { model: preferredModel } = useUserPrefs()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
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
          setTitle(data.title)
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
  }

  function updateStop(index: number, field: keyof StopDraft, value: string) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return

    if (!title.trim() || !origin.trim() || !destination.trim()) {
      setError('Completá título, origen y destino.')
      return
    }
    if (isPublic && !model) {
      setError('Seleccioná el modelo (E2 o E2+) para compartir con la comunidad.')
      return
    }
    const distance = distanceKm.trim() ? Number(distanceKm) : null
    if (distance !== null && (!Number.isFinite(distance) || distance < 0)) {
      setError('La distancia debe ser un número válido.')
      return
    }
    const startCharge = parseOptionalNumber(startingCharge)
    if (!isValidPercentage(startCharge)) {
      setError('La batería al salir debe estar entre 0 y 100.')
      return
    }
    const endCharge = parseOptionalNumber(endingCharge)
    if (!isValidPercentage(endCharge)) {
      setError('La batería al llegar debe estar entre 0 y 100.')
      return
    }
    const avgSpeed = parseOptionalNumber(averageSpeed)
    if (!isValidNonNegative(avgSpeed)) {
      setError('La velocidad media debe ser un número válido.')
      return
    }

    const cleanStops: TripChargingStop[] = []
    for (const s of stops) {
      if (!s.name.trim()) continue
      const arrival = parseOptionalNumber(s.arrivalPercentage)
      const departure = parseOptionalNumber(s.departurePercentage)
      if (!isValidPercentage(arrival) || !isValidPercentage(departure)) {
        setError('Los porcentajes de batería en las paradas deben estar entre 0 y 100.')
        return
      }
      const stopSpeed = parseOptionalNumber(s.averageSpeed)
      if (!isValidNonNegative(stopSpeed)) {
        setError('La velocidad media entre paradas debe ser un número válido.')
        return
      }
      const stop: TripChargingStop = { name: s.name.trim() }
      if (s.note.trim()) stop.note = s.note.trim()
      const distanceFromPrevious = parseOptionalNumber(s.distanceFromPrevious)
      if (distanceFromPrevious !== undefined) stop.distance_from_previous_km = distanceFromPrevious
      if (arrival !== undefined) stop.arrival_percentage = arrival
      if (departure !== undefined) stop.departure_percentage = departure
      const duration = parseOptionalNumber(s.durationMinutes)
      if (duration !== undefined) stop.duration_minutes = duration
      if (stopSpeed !== undefined) stop.average_speed_kmh = stopSpeed
      cleanStops.push(stop)
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      title: title.trim(),
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
    navigate('/mi-actividad')
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
      <PageHeader
        title={isEdit ? '🗺️ Editar viaje' : '🗺️ Nuevo viaje'}
        subtitle="Registrá un viaje y tus paradas de carga para compartir con la comunidad."
      />

      <Card>
        {error && <Alert type="danger">{error}</Alert>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="trip-title">Título</label>
            <input
              id="trip-title"
              type="text"
              className={formStyles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Montevideo - Punta del Este"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-origin">Origen</label>
              <input
                id="trip-origin"
                type="text"
                className={formStyles.input}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Montevideo"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-destination">Destino</label>
              <input
                id="trip-destination"
                type="text"
                className={formStyles.input}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Punta del Este"
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-date">Fecha</label>
              <input
                id="trip-date"
                type="date"
                className={formStyles.input}
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-distance">Distancia (km, opcional)</label>
              <input
                id="trip-distance"
                type="text"
                inputMode="numeric"
                className={formStyles.input}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="140"
              />
            </div>
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
                  <label className={styles.label} htmlFor="trip-starting-charge">Batería al salir (%, opcional)</label>
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
                  <label className={styles.label} htmlFor="trip-ending-charge">Batería al llegar (%, opcional)</label>
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
                <label className={styles.label} htmlFor="trip-avg-speed">Velocidad media del viaje (km/h, opcional)</label>
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
                <label className={styles.label}>Paradas de carga (opcional)</label>
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

                      <div className={styles.stopMainRow}>
                        <div className={styles.field}>
                          <label className={styles.smallLabel}>Nombre del cargador</label>
                          <input
                            type="text"
                            className={formStyles.input}
                            value={stop.name}
                            onChange={(e) => updateStop(index, 'name', e.target.value)}
                            placeholder="Nombre del cargador"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.smallLabel}>Minutos cargando</label>
                          <input
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
                          <label className={styles.smallLabel}>Distancia desde la parada anterior (km)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.distanceFromPrevious}
                            onChange={(e) => updateStop(index, 'distanceFromPrevious', e.target.value)}
                            placeholder="80"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.smallLabel}>Velocidad media hasta acá (km/h)</label>
                          <input
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
                          <label className={styles.smallLabel}>% al llegar</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.arrivalPercentage}
                            onChange={(e) => updateStop(index, 'arrivalPercentage', e.target.value)}
                            placeholder="20"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.smallLabel}>% al salir</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={formStyles.input}
                            value={stop.departurePercentage}
                            onChange={(e) => updateStop(index, 'departurePercentage', e.target.value)}
                            placeholder="80"
                          />
                        </div>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.smallLabel}>Nota (opcional)</label>
                        <textarea
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

          <div className={styles.field}>
            <label className={styles.label}>Calificación (opcional)</label>
            <div className={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.starBtn} ${rating != null && n <= rating ? styles.filled : ''}`}
                  onClick={() => setRating(rating === n ? null : n)}
                  aria-label={`${n} estrellas`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="trip-notes">Notas (opcional)</label>
            <textarea
              id="trip-notes"
              rows={3}
              className={`${formStyles.input} ${formStyles.textarea}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles adicionales..."
            />
          </div>

          <div className={styles.shareBlock}>
            <div className={styles.field}>
              <label className={styles.label}>
                Modelo{isPublic && ' (obligatorio para compartir)'}
              </label>
              <div className={styles.modelRow}>
                {MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.modelBtn} ${model === m ? styles.modelBtnSelected : ''}`}
                    onClick={() => setModel(m)}
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

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => navigate('/mi-actividad')}
              disabled={submitting}
            >
              Cancelar
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
