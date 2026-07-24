import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormError } from '../components/UI'
import EntryFormShell, { NotesField, RatingField, ShareCheckbox } from '../components/EntryFormShell'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ISO_DATE_PATTERN, parseLocaleNumber, todayIsoDate } from '../lib/format'
import { useEntrySubmit } from '../lib/useEntrySubmit'
import { PURCHASE_CATEGORY_GROUPS } from '../lib/purchaseCatalog'
import { suggestTitleFromMercadoLibreUrl } from '../lib/mercadolibre'
import formStyles from '../styles/formControls.module.css'
import CityDatalist, { UY_CITIES_LIST_ID } from '../components/CityDatalist'

export default function NewPartPurchasePage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [purchaseDate, setPurchaseDate] = useState(todayIsoDate())
  const [category, setCategory] = useState(PURCHASE_CATEGORY_GROUPS[0]?.categories[0]?.id ?? 'otros')
  const [item, setItem] = useState('')
  const [store, setStore] = useState('')
  const [priceUyu, setPriceUyu] = useState('')
  const [odometerKm, setOdometerKm] = useState('')
  const [city, setCity] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const { submitting, error, setError, submit } = useEntrySubmit('compra')
  // Any change flips this on; Cancel then asks before discarding.
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('part_purchases')
      .select('*')
      .eq('id', id!)
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
          setLink(data.link ?? '')
          setIsPublic(data.is_public)
        }
        setLoading(false)
      })
  }, [id, isEdit, setError])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return

    if (!ISO_DATE_PATTERN.test(purchaseDate)) {
      setError('La fecha debe tener el formato AAAA-MM-DD.')
      return
    }
    const price = parseLocaleNumber(priceUyu)
    if (price === undefined || !Number.isFinite(price) || price < 0) {
      setError('El precio debe ser un número válido.')
      return
    }
    const km = parseLocaleNumber(odometerKm) ?? null
    if (km != null && (!Number.isFinite(km) || km < 0)) {
      setError('El kilometraje debe ser un número válido.')
      return
    }
    if (!item.trim() || !store.trim()) {
      setError('Completá qué compraste y dónde.')
      return
    }
    const trimmedLink = link.trim()
    if (trimmedLink && !/^https?:\/\//i.test(trimmedLink)) {
      setError('El link debe empezar con http:// o https://.')
      return
    }

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
      link: trimmedLink || null,
      is_public: isPublic,
    }

    const client = supabase
    await submit(() =>
      isEdit
        ? client.from('part_purchases').update(payload).eq('id', id!)
        : client.from('part_purchases').insert({ ...payload, user_id: user.id })
    )
  }

  function handleCancel() {
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return
    navigate('/mi-actividad')
  }

  return (
    <EntryFormShell
      title={isEdit ? '🛒 Editar compra' : '🛒 Nueva compra'}
      subtitle="Registrá un repuesto o accesorio que compraste para llevar tus gastos y recomendar (o no) dónde comprar."
      loading={loading}
      submitting={submitting}
      onCancel={handleCancel}
    >
      {error && <FormError>{error}</FormError>}

      <form className={formStyles.form} onSubmit={handleSubmit} onChange={() => setDirty(true)}>
        <CityDatalist />
        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="purchase-date">
              📅 Fecha
            </label>
            <input
              id="purchase-date"
              required
              type="date"
              className={formStyles.input}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="purchase-category">
              🗂️ Categoría
            </label>
            <select
              id="purchase-category"
              className={formStyles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {PURCHASE_CATEGORY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="purchase-item">
            🔩 ¿Qué compraste?
          </label>
          <input
            id="purchase-item"
            required
            type="text"
            className={formStyles.input}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Ej: 4 cubiertas Kumho 215/60 R17"
          />
          <span className={formStyles.hint}>Marca, modelo y medida ayudan mucho al resto.</span>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="purchase-link">
            🔗 Link a la publicación (opcional)
          </label>
          <input
            id="purchase-link"
            type="url"
            className={formStyles.input}
            value={link}
            onChange={(e) => {
              const value = e.target.value
              setLink(value)
              if (!item.trim()) {
                const suggested = suggestTitleFromMercadoLibreUrl(value)
                if (suggested) setItem(suggested)
              }
            }}
            placeholder="https://articulo.mercadolibre.com.uy/..."
          />
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="purchase-store">
              🏪 ¿Dónde?
            </label>
            <input
              id="purchase-store"
              required
              type="text"
              className={formStyles.input}
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="Comercio o importador"
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="purchase-price">
              💰 Precio (UYU)
            </label>
            <input
              id="purchase-price"
              required
              type="text"
              inputMode="decimal"
              className={formStyles.input}
              value={priceUyu}
              onChange={(e) => setPriceUyu(e.target.value)}
              placeholder="12000"
            />
          </div>
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="purchase-km">
              📏 Kilometraje
            </label>
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
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="purchase-city">
              📍 Ciudad
            </label>
            <input
              id="purchase-city"
              type="text"
              list={UY_CITIES_LIST_ID}
              className={formStyles.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Montevideo"
            />
          </div>
        </div>

        <RatingField
          label="¿Recomendás la compra?"
          value={rating}
          onChange={(v) => {
            setRating(v)
            setDirty(true)
          }}
        />

        <NotesField
          id="purchase-notes"
          value={notes}
          onChange={setNotes}
          placeholder="Plazo de entrega, atención, si volverías a comprar ahí..."
        />

        <ShareCheckbox checked={isPublic} onChange={setIsPublic} />

        <button type="submit" className={formStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
        </button>
      </form>
    </EntryFormShell>
  )
}
