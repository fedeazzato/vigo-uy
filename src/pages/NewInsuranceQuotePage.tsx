import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormError } from '../components/UI'
import EntryFormShell, { NotesField, ShareCheckbox } from '../components/EntryFormShell'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, parseLocaleNumber, todayIsoDate, validateIsoDate } from '../lib/format'
import { useEntrySubmit } from '../lib/useEntrySubmit'
import {
  fetchInsuranceAddons,
  fetchInsuranceProviders,
  replaceInsuranceQuoteAddons,
  type InsuranceQuoteAddonSelection,
} from '../lib/communityData'
import formStyles from '../styles/formControls.module.css'
import {
  INSURANCE_COVERAGE_LABELS,
  INSURANCE_ZONE_LABELS,
  type InsuranceAddon,
  type InsuranceCoverageLevel,
  type InsuranceProvider,
  type InsuranceZone,
} from '../types'

const PERIOD_YEARS_OPTIONS = [1, 2, 3, 4, 5] as const

function periodYearsLabel(n: number): string {
  return `${n} año${n === 1 ? '' : 's'}`
}

export default function NewInsuranceQuotePage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [providers, setProviders] = useState<InsuranceProvider[]>([])
  const [provider, setProvider] = useState('')
  const [coverageLevel, setCoverageLevel] = useState<InsuranceCoverageLevel | ''>('')
  const [driverCount, setDriverCount] = useState('1')
  const [averageDriverAge, setAverageDriverAge] = useState('')
  const [zone, setZone] = useState<InsuranceZone | ''>('')
  const [hireDate, setHireDate] = useState(todayIsoDate())
  const [periodYears, setPeriodYears] = useState<number>(1)
  const [totalCostUyu, setTotalCostUyu] = useState('')
  const [deductibleUyu, setDeductibleUyu] = useState('')
  const [addons, setAddons] = useState<InsuranceAddon[]>([])
  // Keyed by addon slug. limitValue holds whichever of limit_uyu/limit_count
  // applies (the addon's limit_kind says which) -- a single text field per
  // addon regardless of kind, same UX as the old glass-coverage-limit input.
  const [addonSelections, setAddonSelections] = useState<Record<string, { checked: boolean; limitValue: string }>>(
    {}
  )
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const { submitting, error, setError, submit } = useEntrySubmit('seguro')
  // Any change flips this on; Cancel then asks before discarding.
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    void fetchInsuranceProviders().then(({ providers }) => setProviders(providers))
    void fetchInsuranceAddons().then(({ addons }) => setAddons(addons))
  }, [])

  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('insurance_quotes')
      .select('*')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No se pudo cargar la entrada.')
        } else {
          setProvider(data.provider)
          setCoverageLevel(data.coverage_level as InsuranceCoverageLevel)
          setDriverCount(String(data.driver_count))
          setAverageDriverAge(String(data.average_driver_age))
          setZone(data.zone as InsuranceZone)
          setHireDate(data.hire_date)
          setPeriodYears(data.period_years)
          setTotalCostUyu(String(data.total_cost_uyu))
          setDeductibleUyu(data.deductible_uyu != null ? String(data.deductible_uyu) : '')
          setNotes(data.notes ?? '')
          setIsPublic(data.is_public)
        }
        setLoading(false)
      })
  }, [id, isEdit, setError])

  // Existing addon selections, loaded separately from the quote row itself
  // (a join across tables, not a column on insurance_quotes).
  useEffect(() => {
    if (!isEdit || !supabase) return
    supabase
      .from('insurance_quote_addons')
      .select('*')
      .eq('quote_id', id!)
      .then(({ data }) => {
        const selections: Record<string, { checked: boolean; limitValue: string }> = {}
        for (const row of data ?? []) {
          const limitValue = row.limit_uyu ?? row.limit_count
          selections[row.addon] = { checked: true, limitValue: limitValue != null ? String(limitValue) : '' }
        }
        setAddonSelections(selections)
      })
  }, [id, isEdit])

  // Preview only -- the server's generated cost_per_year_uyu is what's
  // actually stored; this never gets sent to Supabase.
  const totalPreview = parseLocaleNumber(totalCostUyu)
  const perYearPreview =
    totalPreview !== undefined && Number.isFinite(totalPreview) && totalPreview >= 0 && periodYears > 0
      ? totalPreview / periodYears
      : null

  // "Todo Riesgo sin Deducible" is the one tier that structurally can't
  // carry a deductible; every other tier usually does (owner decision, this
  // conversation), but the field stays optional -- missing is highlighted
  // below, never blocked.
  const showDeductible = coverageLevel !== 'todo_riesgo_sin_franquicia'

  function handleAddonToggle(slug: string, checked: boolean) {
    setAddonSelections((prev) => ({
      ...prev,
      // Unchecking clears any typed limit too, mirroring the old
      // glass-coverage checkbox: an unchecked addon can never carry a
      // stray limit value into the submit payload.
      [slug]: { checked, limitValue: checked ? (prev[slug]?.limitValue ?? '') : '' },
    }))
  }

  function handleAddonLimitChange(slug: string, value: string) {
    setAddonSelections((prev) => ({ ...prev, [slug]: { checked: true, limitValue: value } }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return

    const dateError = validateIsoDate(hireDate)
    if (dateError) {
      setError(dateError)
      return
    }
    if (!provider) {
      setError('Elegí una aseguradora.')
      return
    }
    if (!coverageLevel) {
      setError('Elegí un nivel de cobertura.')
      return
    }
    if (!zone) {
      setError('Elegí la zona de circulación.')
      return
    }
    const drivers = parseLocaleNumber(driverCount)
    if (drivers === undefined || !Number.isFinite(drivers) || drivers < 1 || drivers > 10) {
      setError('La cantidad de conductores debe ser un número entre 1 y 10.')
      return
    }
    const age = parseLocaleNumber(averageDriverAge)
    if (age === undefined || !Number.isFinite(age) || age < 16 || age > 99) {
      setError('La edad promedio debe ser un número entre 16 y 99.')
      return
    }
    const totalCost = parseLocaleNumber(totalCostUyu)
    if (totalCost === undefined || !Number.isFinite(totalCost) || totalCost < 0) {
      setError('El costo total debe ser un número válido.')
      return
    }

    let deductible: number | undefined
    if (showDeductible && deductibleUyu.trim()) {
      deductible = parseLocaleNumber(deductibleUyu)
      if (deductible === undefined || !Number.isFinite(deductible) || deductible < 0) {
        setError('El deducible debe ser un número válido.')
        return
      }
    }

    const addonSelectionsToSave: InsuranceQuoteAddonSelection[] = []
    for (const addon of addons) {
      const selection = addonSelections[addon.slug]
      if (!selection?.checked) continue
      let limitUyu: number | null = null
      let limitCount: number | null = null
      if (addon.limit_kind === 'cost' && selection.limitValue.trim()) {
        const parsed = parseLocaleNumber(selection.limitValue)
        if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0) {
          setError(`El límite de ${addon.badge_label.toLowerCase()} debe ser un número válido.`)
          return
        }
        limitUyu = parsed
      } else if (addon.limit_kind === 'count' && selection.limitValue.trim()) {
        const parsed = parseLocaleNumber(selection.limitValue)
        if (parsed === undefined || !Number.isInteger(parsed) || parsed < 1) {
          setError(`La cantidad de usos de ${addon.badge_label.toLowerCase()} debe ser un número entero válido.`)
          return
        }
        limitCount = parsed
      }
      addonSelectionsToSave.push({ addon: addon.slug, limitUyu, limitCount })
    }

    const payload = {
      provider,
      coverage_level: coverageLevel,
      driver_count: Math.round(drivers),
      average_driver_age: Math.round(age),
      zone,
      hire_date: hireDate,
      period_years: periodYears,
      total_cost_uyu: totalCost,
      deductible_uyu: deductible ?? null,
      notes: notes.trim() || null,
      is_public: isPublic,
    }

    const client = supabase
    await submit(async () => {
      let quoteId = id
      if (isEdit) {
        const { error } = await client.from('insurance_quotes').update(payload).eq('id', id!)
        if (error) return { error }
      } else {
        const { data, error } = await client
          .from('insurance_quotes')
          .insert({ ...payload, user_id: user.id })
          .select('id')
          .single()
        if (error) return { error }
        quoteId = data.id
      }
      return replaceInsuranceQuoteAddons(quoteId!, addonSelectionsToSave)
    })
  }

  function handleCancel() {
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return
    navigate('/mi-actividad')
  }

  return (
    <EntryFormShell
      title={isEdit ? '🛡️ Editar seguro' : '🛡️ Nuevo seguro'}
      subtitle="Registrá tu póliza para llevar tu historial y aportar a la comunidad."
      loading={loading}
      submitting={submitting}
      onCancel={handleCancel}
    >
      {error && <FormError>{error}</FormError>}

      <form className={formStyles.form} onSubmit={handleSubmit} onChange={() => setDirty(true)}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="insurance-provider">
            🏢 Aseguradora
          </label>
          <select
            id="insurance-provider"
            className={formStyles.input}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="" disabled>
              Seleccioná una aseguradora
            </option>
            {providers.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="insurance-coverage">
            📄 Nivel de cobertura
          </label>
          <select
            id="insurance-coverage"
            className={formStyles.input}
            value={coverageLevel}
            onChange={(e) => setCoverageLevel(e.target.value as InsuranceCoverageLevel)}
          >
            <option value="" disabled>
              Seleccioná una cobertura
            </option>
            {(Object.keys(INSURANCE_COVERAGE_LABELS) as InsuranceCoverageLevel[]).map((level) => (
              <option key={level} value={level}>
                {INSURANCE_COVERAGE_LABELS[level]}
              </option>
            ))}
          </select>
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="insurance-driver-count">
              👥 Conductores
            </label>
            <input
              id="insurance-driver-count"
              required
              type="text"
              inputMode="numeric"
              className={formStyles.input}
              value={driverCount}
              onChange={(e) => setDriverCount(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="insurance-average-age">
              🎂 Edad promedio
            </label>
            <input
              id="insurance-average-age"
              required
              type="text"
              inputMode="numeric"
              className={formStyles.input}
              value={averageDriverAge}
              onChange={(e) => setAverageDriverAge(e.target.value)}
              placeholder="35"
            />
          </div>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="insurance-zone">
            📍 Zona de circulación
          </label>
          <select
            id="insurance-zone"
            className={formStyles.input}
            value={zone}
            onChange={(e) => setZone(e.target.value as InsuranceZone)}
          >
            <option value="" disabled>
              Seleccioná una zona
            </option>
            {(Object.keys(INSURANCE_ZONE_LABELS) as InsuranceZone[]).map((z) => (
              <option key={z} value={z}>
                {INSURANCE_ZONE_LABELS[z]}
              </option>
            ))}
          </select>
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="insurance-hire-date">
              📅 Fecha de contratación
            </label>
            <input
              id="insurance-hire-date"
              required
              type="date"
              className={formStyles.input}
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="insurance-period">
              ⏳ Período contratado
            </label>
            <select
              id="insurance-period"
              required
              className={formStyles.input}
              value={periodYears}
              onChange={(e) => setPeriodYears(Number(e.target.value))}
            >
              {PERIOD_YEARS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {periodYearsLabel(n)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="insurance-total-cost">
            💰 Costo total del período (UYU)
          </label>
          <input
            id="insurance-total-cost"
            required
            type="text"
            inputMode="decimal"
            className={formStyles.input}
            value={totalCostUyu}
            onChange={(e) => setTotalCostUyu(e.target.value)}
            placeholder="45000"
          />
          {perYearPreview !== null && (
            <span className={formStyles.hint}>= {formatCurrency(perYearPreview)}/año</span>
          )}
        </div>

        {showDeductible && (
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="insurance-deductible">
              💸 Deducible (UYU)
            </label>
            <input
              id="insurance-deductible"
              type="text"
              inputMode="decimal"
              className={formStyles.input}
              value={deductibleUyu}
              onChange={(e) => setDeductibleUyu(e.target.value)}
              placeholder="Opcional"
            />
            {deductibleUyu.trim() === '' && (
              <span className={formStyles.hintWarning}>
                ⚠️ Esta cobertura suele tener deducible — falta este dato (podés guardar igual).
              </span>
            )}
          </div>
        )}

        {addons.map((addon) => {
          const selection = addonSelections[addon.slug] ?? { checked: false, limitValue: '' }
          return (
            <div key={addon.slug}>
              <label className={formStyles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={selection.checked}
                  onChange={(e) => handleAddonToggle(addon.slug, e.target.checked)}
                />
                Incluye {addon.checkbox_label}
              </label>

              {addon.limit_kind !== 'none' && selection.checked && (
                <div className={formStyles.field}>
                  <label className={formStyles.label} htmlFor={`insurance-addon-limit-${addon.slug}`}>
                    {addon.icon} {addon.limit_kind === 'cost' ? 'Límite de cobertura (UYU)' : 'Usos gratis por año'}
                  </label>
                  <input
                    id={`insurance-addon-limit-${addon.slug}`}
                    type="text"
                    inputMode={addon.limit_kind === 'cost' ? 'decimal' : 'numeric'}
                    className={formStyles.input}
                    value={selection.limitValue}
                    onChange={(e) => handleAddonLimitChange(addon.slug, e.target.value)}
                    placeholder="Opcional"
                  />
                  <span className={formStyles.hint}>
                    {addon.limit_kind === 'cost'
                      ? 'Dejalo vacío si es sin cargo / sin límite.'
                      : 'Dejalo vacío si no tiene límite de usos.'}
                  </span>
                </div>
              )}
            </div>
          )
        })}

        <NotesField
          id="insurance-notes"
          value={notes}
          onChange={setNotes}
          placeholder="Detalles adicionales..."
        />

        <ShareCheckbox checked={isPublic} onChange={setIsPublic} />

        <button type="submit" className={formStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
        </button>
      </form>
    </EntryFormShell>
  )
}
