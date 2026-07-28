import { useState } from 'react'
import styles from './PurchaseThumbnail.module.css'

interface PurchaseThumbnailProps {
  src: string | null
  alt: string
  link?: string | null
}

// Renders nothing when there's no image, or when the pasted URL fails to
// load (dead link, not actually an image, hotlink-blocked, etc.) -- no
// broken-image icon. No image is the common case: most purchases won't
// have one.
export default function PurchaseThumbnail({ src, alt, link }: PurchaseThumbnailProps) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null

  const content = (
    <img className={styles.thumbnail} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  )

  if (!link) return content

  return (
    <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc">
      {content}
    </a>
  )
}
