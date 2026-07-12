import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Card, Alert, Skeleton } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { invalidateCommunityCache } from '../lib/communityData'
import { partsCatalog } from '../lib/partsCatalog'
import styles from './NewPartPurchasePage.module.css'
import formStyles from '../styles/formControls.module.css'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewPartPurchasePage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [purchaseDate, setPurchaseDate] = useState(today())
  const [category, setCategory] = useState(partsCatalog.categories[0]?.id ?? 'otros')
  const [item, setItem] = useState('')
  const [store, setStore] = useState('')
  const [priceUyu, setPriceUyu] = useState('')
  const [odometerKm, setOdometerKm] = useState('')
  const [city, setCity] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('part_purchases')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No se pudo cargar la compra.')
        } else {
          setPurchaseDate(data.purchase_date)
          setCategory(data.category)
          setItem(data.item)
          setStore(data.store)
          setPriceUyu(String(data.price_uyu))
          setOdometerKm(data.odometer_km != null ? String(data.odometer_km) : '')
          setCity(data.city ?? '')
          setRating(data.rating)
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
        }
        setLoading(false)
      })
  }, [id, isEdit])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return

    if (!DATE_PATTERN.test(purchaseDate)) {
      setError('La fecha debe tener el formato AAAA-MM-DD.')
      return
    }
    const price = Number(priceUyu)
    if (!Number.isFinite(price) || price < 0) {
      setError('El precio debe ser un número válido.')
      return
    }
    const km = odometerKm.trim() ? Number(odometerKm) : null
    if (km != null && (!Number.isFinite(km) || km < 0)) {
      setError('El kilometraje debe ser un número válido.')
      return
    }
    if (!item.trim() || !store.trim()) {
      setError('Completá qué compraste y dónde.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      purchase_date: purchaseDate,
      category,
      item: item.trim(),
      store: store.trim(),
      price_uyu: price,
      odometer_km: km != null ? Math.round(km) : null,
      city: city.trim() || null,
      rating,
      notes: notes.trim() || null,
      is_public: isPublic,
    }

    const { error } = isEdit
      ? await supabase.from('part_purchases').update(payload).eq('id', id)
      : await supabase.from('part_purchases').insert({ ...payload, user_id: user.id })

    setSubmitting(false)

    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    navigate('/mi-actividad')
  }

  // Edit mode: show the header + a skeleton instead of a blank screen while
  // the purchase being edited loads.
  if (loading) {
    return (
      <div>
        <PageHeader
          title={isEdit ? '🔩 Editar compra de repuesto' : '🔩 Nueva compra de repuesto'}
          subtitle="Registrá lo que compraste para llevar tus gastos y recomendar (o no) dónde comprar."
        />
        <Skeleton lines={6} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? '🔩 Editar compra de repuesto' : '🔩 Nueva compra de repuesto'}
        subtitle="Registrá lo que compraste para llevar tus gastos y recomendar (o no) dónde comprar."
      />

      <Card>
        {error && <Alert type="danger">{error}</Alert>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchase-date">Fecha</label>
              <input
                id="purchase-date"
                type="date"
                className={formStyles.input}
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchase-category">Categoría</label>
              <select
                id="purchase-category"
                className={formStyles.input}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {partsCatalog.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="purchase-item">¿Qué compraste?</label>
            <input
              id="purchase-item"
              type="text"
              className={formStyles.input}
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Ej: 4 cubiertas Kumho 215/60 R17"
            />
            <span className={styles.hint}>Marca, modelo y medida ayudan mucho al resto.</span>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchase-store">¿Dónde?</label>
              <input
                id="purchase-store"
                type="text"
                className={formStyles.input}
                value={store}
                onChange={(e) => setStore(e.target.value)}
                placeholder="Comercio o importador"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchase-price">Precio (UYU)</label>
              <input
                id="purchase-price"
                type="text"
                inputMode="decimal"
                className={formStyles.input}
                value={priceUyu}
                onChange={(e) => setPriceUyu(e.target.value)}
                placeholder="12000"
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchase-km">Kilometraje (opcional)</label>
              <input
                id="purchase-km"
                type="text"
                inputMode="numeric"
                className={formStyles.input}
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
                placeholder="45000"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchase-city">Ciudad (opcional)</label>
              <input
                id="purchase-city"
                type="text"
                className={formStyles.input}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Montevideo"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>¿Recomendás la compra?</span>
            <div className={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={styles.starBtn}
                  aria-label={`${n} de 5`}
                  onClick={() => setRating(rating === n ? null : n)}
                >
                  {rating != null && n <= rating ? '★' : '☆'}
                </button>
              ))}
              {rating != null && (
                <button type="button" className={styles.clearRating} onClick={() => setRating(null)}>
                  Quitar
                </button>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="purchase-notes">Notas (opcional)</label>
            <textarea
              id="purchase-notes"
              rows={3}
              className={`${formStyles.input} ${formStyles.textarea}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Plazo de entrega, atención, si volverías a comprar ahí..."
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
