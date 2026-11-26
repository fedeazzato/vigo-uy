// «Qué agrega el instalador a tu Vigo» (specs/installer-features-page.md): the curated feature list and its route.
import rawData from '../data/installerFeatures.json'
import type { InstallerFeatureStatus, InstallerFeaturesData } from '../types'

export const INSTALLER_FEATURES_PATH = '/mi-vigo/preparar/que-agrega'

export const installerFeatures = rawData as InstallerFeaturesData

/** The badge each status shows; null = no badge (every owner gets it). */
export const STATUS_BADGE: Record<InstallerFeatureStatus, { label: string; color: 'blue' | 'gray' } | null> =
  {
    incluido: null,
    opcional: { label: 'Opcional', color: 'blue' },
    deFabrica: { label: 'Ya viene de fábrica', color: 'gray' },
  }
