import { useEffect, useRef } from 'react'
import { useUserPrefs } from '../context/UserPrefsContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

// Keeps the device-local "Mi Vigo" prefs (model/color) and the account
// profile row in sync, so Mi Vigo stays the single place to pick them:
// - when the profile first loads after sign-in, prefs unset on this device
//   adopt the account's stored values
// - from then on local prefs are the source of truth: changes made in
//   Mi Vigo (including "Limpiar") push to the profiles row silently
export default function ProfilePrefsSync() {
  const { model, color, setModel, setColor } = useUserPrefs()
  const { user, profile, refreshProfile } = useAuth()
  const hydrated = useRef(false)

  useEffect(() => {
    hydrated.current = false
  }, [user?.id])

  useEffect(() => {
    if (!supabase || !profile) return

    let localModel = model ?? null
    let localColor = color ?? null

    if (!hydrated.current) {
      hydrated.current = true
      if (!localModel && profile.model) {
        localModel = profile.model
        setModel(profile.model)
      }
      if (!localColor && profile.color) {
        localColor = profile.color
        setColor(profile.color)
      }
    }

    if (localModel === (profile.model ?? null) && localColor === (profile.color ?? null)) return

    supabase
      .from('profiles')
      .update({ model: localModel, color: localColor })
      .eq('id', profile.id)
      .then(({ error }) => {
        if (!error) refreshProfile()
      })
    // setters/refreshProfile deliberately omitted: they are recreated per
    // render and the effect only needs to react to value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, model, color])

  return null
}
