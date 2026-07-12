import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, Alert, Skeleton } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { invalidateCommunityCache } from '../lib/communityData'
import rawMantenimiento from '../data/mantenimiento.json'
import type { MantenimientoData } from '../types'
import styles from './NewServiceEntryPage.module.css'
import formStyles from '../styles/formControls.module.css'

const mantenimiento = rawMantenimiento as MantenimientoData
const KNOWN_DEALERS = [...new Set(mantenimiento.dealerPrices.map((d) => d.dealer))]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewServiceEntryPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [serviceDate, setServiceDate] = useState(today())
  const [odometerKm, setOdometerKm] = useState('')
  const [dealer, setDealer] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [costUyu, setCostUyu] = useState('')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('service_entries')
      .select('*')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No se pudo cargar la entrada.')
        } else {
          setServiceDate(data.service_date)
          setOdometerKm(String(data.odometer_km))
          setDealer(data.dealer)
          setServiceType(data.service_type)
          setCostUyu(String(data.cost_uyu))
          setCity(data.city ?? '')
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
        }
        setLoading(false)
      })
  }, [id, isEdit])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return

    if (!DATE_PATTERN.test(serviceDate)) {
      setError('La fecha debe tener el formato AAAA-MM-DD.')
      return
    }
    const km = Number(odometerKm)
    const cost = Number(costUyu)
    if (!Number.isFinite(km) || km < 0) {
      setError('El kilometraje debe ser un número válido.')
      return
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError('El costo debe ser un número válido.')
      return
    }
    if (!dealer.trim() || !serviceType.trim()) {
      setError('Completá el taller y el tipo de service.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      service_date: serviceDate,
      odometer_km: Math.round(km),
      dealer: dealer.trim(),
      service_type: serviceType.trim(),
      cost_uyu: cost,
      city: city.trim() || null,
      notes: notes.trim() || null,
      is_public: isPublic,
    }

    const { error } = isEdit
      ? await supabase.from('service_entries').update(payload).eq('id', id!)
      : await supabase.from('service_entries').insert({ ...payload, user_id: user.id })

    setSubmitting(false)

    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    navigate('/mi-actividad')
  }

  // Edit mode: show the header + a skeleton instead of a blank screen while
  // the entry being edited loads.
  if (loading) {
    return (
      <div>
        <PageHeader
          title={isEdit ? '🛠️ Editar costo de service' : '🛠️ Nuevo costo de service'}
          subtitle="Registrá una visita al taller para llevar tu historial y aportar a la comunidad."
        />
        <Skeleton lines={6} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? '🛠️ Editar costo de service' : '🛠️ Nuevo costo de service'}
        subtitle="Registrá una visita al taller para llevar tu historial y aportar a la comunidad."
      />

      <Card>
        {error && <Alert type="danger">{error}</Alert>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="service-date">Fecha</label>
              <input
                id="service-date"
                type="date"
                className={formStyles.input}
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="service-km">Kilometraje</label>
              <input
                id="service-km"
                type="text"
                inputMode="numeric"
                className={formStyles.input}
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
                placeholder="45000"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="service-dealer">Taller</label>
            <input
              id="service-dealer"
              type="text"
              className={formStyles.input}
              value={dealer}
              onChange={(e) => setDealer(e.target.value)}
              placeholder="Nombre del taller"
            />
            <span className={styles.hint}>Talleres conocidos: {KNOWN_DEALERS.join(', ')}</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="service-type">Tipo de service</label>
            <input
              id="service-type"
              type="text"
              className={formStyles.input}
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              placeholder="Ej: service de 15.000 km"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="service-cost">Costo (UYU)</label>
              <input
                id="service-cost"
                type="text"
                inputMode="decimal"
                className={formStyles.input}
                value={costUyu}
                onChange={(e) => setCostUyu(e.target.value)}
                placeholder="7500"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="service-city">Ciudad</label>
              <input
                id="service-city"
                type="text"
                className={formStyles.input}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Montevideo"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="service-notes">Notas (opcional)</label>
            <textarea
              id="service-notes"
              rows={3}
              className={`${formStyles.input} ${formStyles.textarea}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
