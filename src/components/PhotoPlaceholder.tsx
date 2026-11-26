import styles from './PhotoPlaceholder.module.css'

// A dashed frame where a screenshot from the car will go (Preparar mi Vigo, Qué agrega el instalador).
export default function PhotoPlaceholder({ caption }: { caption: string }) {
  return (
    <figure className={styles.photo}>
      <div className={styles.photoBox} aria-hidden="true">
        📷
      </div>
      <figcaption>Foto (próximamente): {caption}</figcaption>
    </figure>
  )
}
