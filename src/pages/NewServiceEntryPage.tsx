import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormError } from '../components/UI'
import EntryFormShell, { NotesField, ShareCheckbox } from '../components/EntryFormShell'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ISO_DATE_PATTERN, parseLocaleNumber, todayIsoDate } from '../lib/format'
import { useEntrySubmit } from '../lib/useEntrySubmit'
import rawMantenimiento from '../data/mantenimiento.json'
import type { MantenimientoData } from '../types'
import formStyles from '../styles/formControls.module.css'
import CityDatalist, { UY_CITIES_LIST_ID } from '../components/CityDatalist'

const mantenimiento = rawMantenimiento as MantenimientoData
const KNOWN_DEALERS = [...new Set(mantenimiento.dealerPrices.map((d) => d.dealer))]

export default function NewServiceEntryPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [serviceDate, setServiceDate] = useState(todayIsoDate())
  const [odometerKm, setOdometerKm] = useState('')
  const [dealer, setDealer] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [costUyu, setCostUyu] = useState('')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const { submitting, error, setError, submit } = useEntrySubmit('service')
  // Any change flips this on; Cancel then asks before discarding.
  const [dirty, setDirty] = useState(false)

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
          // fallow-ignore-next-line code-duplication -- per-field edit hydration necessarily mirrors the sibling form
          setCity(data.city ?? '')
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
        }
        setLoading(false)
      })
  }, [id, isEdit, setError])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return

    if (!ISO_DATE_PATTERN.test(serviceDate)) {
      setError('La fecha debe tener el formato AAAA-MM-DD.')
      return
    }
    const km = parseLocaleNumber(odometerKm)
    const cost = parseLocaleNumber(costUyu)
    if (km === undefined || !Number.isFinite(km) || km < 0) {
      setError('El kilometraje debe ser un número válido.')
      return
    }
    if (cost === undefined || !Number.isFinite(cost) || cost < 0) {
      setError('El costo debe ser un número válido.')
      return
    }
    if (!dealer.trim() || !serviceType.trim()) {
      setError('Completá el taller y el tipo de service.')
      return
    }

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

    const client = supabase
    await submit(() =>
      isEdit
        ? client.from('service_entries').update(payload).eq('id', id!)
        : client.from('service_entries').insert({ ...payload, user_id: user.id })
    )
  }

  function handleCancel() {
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return
    navigate('/mi-actividad')
  }

  return (
    <EntryFormShell
      title={isEdit ? '🛠️ Editar costo de service' : '🛠️ Nuevo costo de service'}
      subtitle="Registrá una visita al taller para llevar tu historial y aportar a la comunidad."
      // fallow-ignore-next-line code-duplication -- both simple entry forms open with the same shell props and date field
      loading={loading}
      submitting={submitting}
      onCancel={handleCancel}
    >
        {error && <FormError>{error}</FormError>}

        <form className={formStyles.form} onSubmit={handleSubmit} onChange={() => setDirty(true)}>
          <CityDatalist />
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="service-date">📅 Fecha</label>
              <input
                id="service-date"
                required
                type="date"
                className={formStyles.input}
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="service-km">📏 Kilometraje</label>
              <input
                id="service-km"
                required
                type="text"
                inputMode="numeric"
                className={formStyles.input}
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
                placeholder="45000"
              />
            </div>
          </div>

          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="service-dealer">🔧 Taller</label>
            <input
              id="service-dealer"
              required
              type="text"
              className={formStyles.input}
              value={dealer}
              onChange={(e) => setDealer(e.target.value)}
              placeholder="Nombre del taller"
            />
            <span className={formStyles.hint}>Talleres conocidos: {KNOWN_DEALERS.join(', ')}</span>
          </div>

          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="service-type">🛠️ Tipo de service</label>
            <input
              id="service-type"
              required
              type="text"
              className={formStyles.input}
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              placeholder="Ej: service de 15.000 km"
            />
          </div>

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="service-cost">💰 Costo (UYU)</label>
              <input
                id="service-cost"
                required
                type="text"
                inputMode="decimal"
                className={formStyles.input}
                value={costUyu}
                onChange={(e) => setCostUyu(e.target.value)}
                placeholder="7500"
              />
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="service-city">📍 Ciudad</label>
              <input
                id="service-city"
                type="text"
                list={UY_CITIES_LIST_ID}
                className={formStyles.input}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Montevideo"
              />
            </div>
          </div>

          <NotesField id="service-notes" value={notes} onChange={setNotes} placeholder="Detalles adicionales..." />

          <ShareCheckbox checked={isPublic} onChange={setIsPublic} />

          <button type="submit" className={formStyles.submitBtn} disabled={submitting}>
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
          </button>
        </form>
    </EntryFormShell>
  )
}
