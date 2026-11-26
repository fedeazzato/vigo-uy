// «Qué agrega el instalador» is live for beta testers and moderators only (owner 2026-11-26, specs/installer-features-page.md):
// a signed-in user whose car is in beta (my_car_beta, migration 0084) or a moderator. Everyone else gets «Muy pronto», and the
// links to the page are not rendered. This only hides a page of public information; it protects nothing.
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchCarBeta } from './carBeta'

export type InstallerFeaturesAccess = 'loading' | 'allowed' | 'denied'

export function useInstallerFeaturesAccess(): InstallerFeaturesAccess {
  const { user, profile, status } = useAuth()
  const isModerator = profile?.is_moderator === true
  const userId = user?.id ?? null
  const [beta, setBeta] = useState<{ userId: string; beta: boolean } | null>(null)

  useEffect(() => {
    if (!userId || isModerator) return
    let cancelled = false
    void fetchCarBeta().then((s) => {
      if (!cancelled) setBeta({ userId, beta: s !== null && s.allowed && s.beta })
    })
    return () => {
      cancelled = true
    }
  }, [userId, isModerator])

  if (status === 'loading') return 'loading'
  if (!userId) return 'denied'
  if (isModerator) return 'allowed'
  if (!beta || beta.userId !== userId) return 'loading'
  return beta.beta ? 'allowed' : 'denied'
}
