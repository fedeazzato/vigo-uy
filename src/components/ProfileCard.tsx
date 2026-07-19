import { FormEvent, useEffect, useState } from 'react'
import { Card, CardTitle, Alert } from './UI'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import formStyles from '../styles/formControls.module.css'
import CityDatalist, { UY_CITIES_LIST_ID } from './CityDatalist'

// Account identity shown on community content. Model and color are NOT
// edited here: the Mi Vigo selectors above are the single place to pick
// them, and ProfilePrefsSync mirrors them to the profile row.
export default function ProfileCard() {
  const { user, profile, refreshProfile } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name)
    setCity(profile.city ?? '')
  }, [profile])

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    if (!displayName.trim()) {
      setError('El nombre no puede quedar vacío.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        city: city.trim() || null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (saveError) {
      setError(toFriendlyError(saveError))
      return
    }
    await refreshProfile()
    setMessage('Perfil actualizado.')
  }

  return (
    <Card>
      <CardTitle icon="👤">Mi perfil</CardTitle>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}
      <form className={formStyles.form} onSubmit={saveProfile}>
        <CityDatalist />
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="profile-name">✏️ Nombre visible</label>
          <input
            id="profile-name"
            required
            type="text"
            className={formStyles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Tu nombre en la comunidad"
          />
          <span className={formStyles.hint}>Aparece junto a tus viajes y services compartidos.</span>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="profile-city">📍 Ciudad</label>
          <input
            id="profile-city"
            type="text"
            list={UY_CITIES_LIST_ID}
            className={formStyles.input}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Montevideo"
          />
        </div>

        <div>
          <button type="submit" className={formStyles.submitBtnCompact} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>
      </form>
    </Card>
  )
}
