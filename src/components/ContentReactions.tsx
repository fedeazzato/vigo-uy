import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import {
  deleteComment,
  fetchAuthorNames,
  fetchComments,
  fetchReactions,
  postComment,
  toggleReaction,
} from '../lib/communityData'
import { formatDate } from '../lib/format'
import type { ContentComment, ReactableContent } from '../types'
import formStyles from '../styles/formControls.module.css'
import styles from './ContentReactions.module.css'

const MAX_COMMENT_LENGTH = 280

interface ContentReactionsProps {
  content: ReactableContent
}

// Thumbs-up + short comments, dropped into any card for a community content
// row (ServiceEntryCard, TripCard, the purchase card/list-item). Not used on
// curated JSON content -- see migration 0027 for why.
export default function ContentReactions({ content }: ContentReactionsProps) {
  const { user, profile, status } = useAuth()
  const [likeCount, setLikeCount] = useState(0)
  const [likedByMe, setLikedByMe] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<ContentComment[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void fetchReactions(content.kind, [content.id], user?.id ?? null).then(({ counts, likedByMe }) => {
      if (cancelled) return
      setLikeCount(counts[content.id] ?? 0)
      setLikedByMe(likedByMe.has(content.id))
    })
    return () => {
      cancelled = true
    }
  }, [content.kind, content.id, user?.id])

  useEffect(() => {
    if (!supabase || !showComments || comments !== null) return
    let cancelled = false
    void fetchComments(content.kind, [content.id]).then(async (rows) => {
      if (cancelled) return
      setComments(rows)
      const userIds = [...new Set(rows.map((r) => r.user_id))]
      if (userIds.length > 0) {
        const map = await fetchAuthorNames(userIds)
        if (!cancelled) setNames(map)
      }
    })
    return () => {
      cancelled = true
    }
  }, [content.kind, content.id, showComments, comments])

  async function handleToggleLike() {
    if (!supabase || !user) return
    const wasLiked = likedByMe
    setLikedByMe(!wasLiked)
    setLikeCount((c) => c + (wasLiked ? -1 : 1))
    const { error } = await toggleReaction(content.kind, content.id, user.id, wasLiked)
    if (error) {
      setLikedByMe(wasLiked)
      setLikeCount((c) => c + (wasLiked ? 1 : -1))
      setError(error)
    }
  }

  async function handleSubmitComment(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    setError(null)
    const { error } = await postComment(content.kind, content.id, user.id, body)
    setPosting(false)
    if (error) {
      setError(error)
      return
    }
    setDraft('')
    const rows = await fetchComments(content.kind, [content.id])
    setComments(rows)
  }

  async function handleDeleteComment(id: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar este comentario?')) return
    const { error } = await deleteComment(id)
    if (error) {
      setError(error)
      return
    }
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id))
  }

  if (!supabase) return null

  return (
    <div>
      <div className={styles.actionsRow}>
        <button
          type="button"
          className={`${styles.likeBtn} ${likedByMe ? styles.likeBtnActive : ''}`}
          onClick={handleToggleLike}
          disabled={status !== 'signedIn'}
          aria-pressed={likedByMe}
          title={status === 'signedIn' ? undefined : 'Iniciá sesión para reaccionar'}
        >
          👍 {likeCount > 0 ? `Me sirvió (${likeCount})` : 'Me sirvió'}
        </button>
        <button type="button" className={styles.commentsToggle} onClick={() => setShowComments((v) => !v)}>
          💬 {showComments ? 'Ocultar comentarios' : 'Comentarios'}
        </button>
      </div>

      {error && <p className={styles.signInHint}>{error}</p>}

      {showComments && (
        <div>
          {comments && comments.length > 0 && (
            <ul className={styles.comments}>
              {comments.map((c) => (
                <li key={c.id} className={styles.comment}>
                  {c.body}
                  <div className={styles.commentMeta}>
                    <span className={styles.commentAuthor}>{names[c.user_id] ?? 'un usuario'}</span>
                    <span className={styles.commentAuthor}>{formatDate(c.created_at.slice(0, 10))}</span>
                    {(c.user_id === user?.id || profile?.is_moderator) && (
                      <button className={styles.commentDelete} onClick={() => handleDeleteComment(c.id)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {status === 'signedIn' ? (
            <form className={styles.commentForm} onSubmit={handleSubmitComment}>
              <input
                type="text"
                className={`${formStyles.input} ${styles.commentInput}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Agregá un comentario breve…"
                aria-label="Nuevo comentario"
              />
              <button type="submit" className={styles.commentSubmit} disabled={posting || !draft.trim()}>
                {posting ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
          ) : (
            <p className={styles.signInHint}>
              <Link to="/login">Iniciá sesión</Link> para comentar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
