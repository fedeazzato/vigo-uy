import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { ChEdit } from '../lib/chameleon/ChEdit'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import type { TripChargingStop } from '../types'
import styles from './NewTripLogPage.module.css'
import formStyles from '../styles/formControls.module.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// Form state for a stop keeps every value as a string (ch-edit needs a
// controlled string value); numbers are parsed only on submit.
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
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [tripDate, setTripDate] = useState(today())
  const [startingCharge, setStartingCharge] = useState('')
  const [endingCharge, setEndingCharge] = useState('')
  const [averageSpeed, setAverageSpeed] = useState('')
  const [stops, setStops] = useState<StopDraft[]>([])
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('trip_logs')
      .select('*')
      .eq('id', id)
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
          setStartingCharge(data.starting_charge_percentage != null ? String(data.starting_charge_percentage) : '')
          setEndingCharge(data.ending_charge_percentage != null ? String(data.ending_charge_percentage) : '')
          setAverageSpeed(data.average_speed_kmh != null ? String(data.average_speed_kmh) : '')
          setStops(((data.charging_stops ?? []) as TripChargingStop[]).map(stopToDraft))
          setRating(data.rating)
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
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
      starting_charge_percentage: startCharge ?? null,
      ending_charge_percentage: endCharge ?? null,
      average_speed_kmh: avgSpeed ?? null,
      charging_stops: cleanStops,
      rating,
      notes: notes.trim() || null,
      is_public: isPublic,
    }

    const { error } = isEdit
      ? await supabase.from('trip_logs').update(payload).eq('id', id)
      : await supabase.from('trip_logs').insert({ ...payload, user_id: user.id })

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    navigate('/mi-actividad')
  }

  if (loading) return null

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
            <ChEdit
              id="trip-title"
              className={formStyles.chInput}
              value={title}
              onInput={(e: any) => setTitle(e.target.value ?? '')}
              type="text"
              placeholder="Ej: Montevideo - Punta del Este"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-origin">Origen</label>
              <ChEdit
                id="trip-origin"
                className={formStyles.chInput}
                value={origin}
                onInput={(e: any) => setOrigin(e.target.value ?? '')}
                type="text"
                placeholder="Montevideo"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-destination">Destino</label>
              <ChEdit
                id="trip-destination"
                className={formStyles.chInput}
                value={destination}
                onInput={(e: any) => setDestination(e.target.value ?? '')}
                type="text"
                placeholder="Punta del Este"
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-date">Fecha</label>
              <ChEdit
                id="trip-date"
                className={formStyles.chInput}
                value={tripDate}
                onInput={(e: any) => setTripDate(e.target.value ?? '')}
                type="date"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-distance">Distancia (km, opcional)</label>
              <ChEdit
                id="trip-distance"
                className={formStyles.chInput}
                value={distanceKm}
                onInput={(e: any) => setDistanceKm(e.target.value ?? '')}
                type="text"
                mode="numeric"
                placeholder="140"
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-starting-charge">Batería al salir (%, opcional)</label>
              <ChEdit
                id="trip-starting-charge"
                className={formStyles.chInput}
                value={startingCharge}
                onInput={(e: any) => setStartingCharge(e.target.value ?? '')}
                type="text"
                mode="numeric"
                placeholder="90"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="trip-ending-charge">Batería al llegar (%, opcional)</label>
              <ChEdit
                id="trip-ending-charge"
                className={formStyles.chInput}
                value={endingCharge}
                onInput={(e: any) => setEndingCharge(e.target.value ?? '')}
                type="text"
                mode="numeric"
                placeholder="15"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="trip-avg-speed">Velocidad media del viaje (km/h, opcional)</label>
            <ChEdit
              id="trip-avg-speed"
              className={formStyles.chInput}
              value={averageSpeed}
              onInput={(e: any) => setAverageSpeed(e.target.value ?? '')}
              type="text"
              mode="decimal"
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
                    <ChEdit
                      className={formStyles.chInput}
                      value={stop.name}
                      onInput={(e: any) => updateStop(index, 'name', e.target.value ?? '')}
                      type="text"
                      placeholder="Nombre del cargador"
                    />
                    <ChEdit
                      className={formStyles.chInput}
                      value={stop.note}
                      onInput={(e: any) => updateStop(index, 'note', e.target.value ?? '')}
                      type="text"
                      placeholder="Nota (opcional)"
                    />
                  </div>

                  <div className={styles.stopChargeRow}>
                    <div className={styles.field}>
                      <label className={styles.smallLabel}>Distancia desde la parada anterior (km)</label>
                      <ChEdit
                        className={formStyles.chInput}
                        value={stop.distanceFromPrevious}
                        onInput={(e: any) => updateStop(index, 'distanceFromPrevious', e.target.value ?? '')}
                        type="text"
                        mode="numeric"
                        placeholder="80"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.smallLabel}>% al llegar</label>
                      <ChEdit
                        className={formStyles.chInput}
                        value={stop.arrivalPercentage}
                        onInput={(e: any) => updateStop(index, 'arrivalPercentage', e.target.value ?? '')}
                        type="text"
                        mode="numeric"
                        placeholder="20"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.smallLabel}>% al salir</label>
                      <ChEdit
                        className={formStyles.chInput}
                        value={stop.departurePercentage}
                        onInput={(e: any) => updateStop(index, 'departurePercentage', e.target.value ?? '')}
                        type="text"
                        mode="numeric"
                        placeholder="80"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.smallLabel}>Minutos cargando</label>
                      <ChEdit
                        className={formStyles.chInput}
                        value={stop.durationMinutes}
                        onInput={(e: any) => updateStop(index, 'durationMinutes', e.target.value ?? '')}
                        type="text"
                        mode="numeric"
                        placeholder="35"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.smallLabel}>Velocidad media hasta acá (km/h)</label>
                      <ChEdit
                        className={formStyles.chInput}
                        value={stop.averageSpeed}
                        onInput={(e: any) => updateStop(index, 'averageSpeed', e.target.value ?? '')}
                        type="text"
                        mode="decimal"
                        placeholder="90"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className={styles.addStopBtn} onClick={addStop}>
              + Agregar parada
            </button>
          </div>

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
            <ChEdit
              id="trip-notes"
              className={`${formStyles.chInput} ${formStyles.chTextarea}`}
              value={notes}
              onInput={(e: any) => setNotes(e.target.value ?? '')}
              multiline
              autoGrow
              placeholder="Detalles adicionales..."
            />
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Compartir con la comunidad (se muestra sin tu email, solo tu nombre)
          </label>

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
