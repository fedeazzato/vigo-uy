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
  const [stops, setStops] = useState<TripChargingStop[]>([])
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
          setStops(data.charging_stops ?? [])
          setRating(data.rating)
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
        }
        setLoading(false)
      })
  }, [id, isEdit])

  function addStop() {
    setStops((prev) => [...prev, { name: '', note: '' }])
  }

  function updateStop(index: number, field: keyof TripChargingStop, value: string) {
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

    setSubmitting(true)
    setError(null)

    const cleanStops = stops
      .filter((s) => s.name.trim())
      .map((s) => ({ name: s.name.trim(), ...(s.note?.trim() ? { note: s.note.trim() } : {}) }))

    const payload = {
      title: title.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      distance_km: distance,
      trip_date: tripDate,
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

          <div className={styles.field}>
            <label className={styles.label}>Paradas de carga (opcional)</label>
            {stops.length === 0 && <p className={styles.emptyStops}>Sin paradas registradas.</p>}
            <div className={styles.stopsList}>
              {stops.map((stop, index) => (
                <div key={index} className={styles.stopRow}>
                  <ChEdit
                    className={formStyles.chInput}
                    value={stop.name}
                    onInput={(e: any) => updateStop(index, 'name', e.target.value ?? '')}
                    type="text"
                    placeholder="Nombre del cargador"
                  />
                  <ChEdit
                    className={formStyles.chInput}
                    value={stop.note ?? ''}
                    onInput={(e: any) => updateStop(index, 'note', e.target.value ?? '')}
                    type="text"
                    placeholder="Nota (opcional)"
                  />
                  <button
                    type="button"
                    className={styles.removeStopBtn}
                    onClick={() => removeStop(index)}
                  >
                    Quitar
                  </button>
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
