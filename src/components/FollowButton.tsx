// "Seguir" / "Avisarme" toggle for a station or a community post
// (specs/community-notifications.md). Signed-in only: a follow is what
// makes the database triggers send this user in-site notifications.
import { useAuth } from '../context/AuthContext'
import { useFollow } from '../lib/notifications'
import type { FollowTarget } from '../lib/notifications'
import styles from './ContentReactions.module.css'

interface FollowButtonProps {
  target: FollowTarget
  // Labels: [not following, following].
  labels?: [string, string]
}

export default function FollowButton({ target, labels = ['🔔 Seguir', '🔕 Dejar de seguir'] }: FollowButtonProps) {
  const { user, status } = useAuth()
  const { following, toggle, error } = useFollow(target, user?.id ?? null)
  if (status !== 'signedIn') return null
  return (
    <>
      <button
        type="button"
        className={`${styles.likeBtn} ${following ? styles.likeBtnActive : ''}`}
        onClick={() => void toggle()}
        aria-pressed={following}
      >
        {following ? labels[1] : labels[0]}
      </button>
      {error && <span className={styles.signInHint}>{error}</span>}
    </>
  )
}
