import type { Color } from '../types'
import styles from './CarPreview.module.css'

const BASE = import.meta.env.BASE_URL

const CAR_IMAGE: Record<Color, string> = {
  Blanco: `${BASE}car-blanco.jpg`,
  Verde: `${BASE}car-verde.jpg`,
  Gris: `${BASE}car-gris.jpg`,
  Beige: `${BASE}car-beige.jpg`,
  Negro: `${BASE}car-negro.jpg`,
}

interface CarPreviewProps {
  color: Color | null
}

export function CarPreview({ color }: CarPreviewProps) {
  return (
    <div className={styles.wrapper}>
      <img
        src={color ? CAR_IMAGE[color] : `${BASE}car-blanco.jpg`}
        alt={`Vigo color ${color ?? 'Blanco'}`}
        className={styles.base}
        draggable={false}
      />
    </div>
  )
}
