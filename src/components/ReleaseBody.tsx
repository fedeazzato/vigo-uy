// A release's own notes (from its GitHub release) as page elements; nothing is inserted as HTML.
import { parseReleaseText, parseSpans, type ListItem } from '../lib/releaseText'
import styles from './ReleaseBody.module.css'

function Spans({ text }: { text: string }) {
  return (
    <>
      {parseSpans(text).map((s, i) =>
        s.kind === 'bold' ? (
          <strong key={i}>{s.text}</strong>
        ) : s.kind === 'code' ? (
          <code key={i}>{s.text}</code>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  )
}

function List({ items }: { items: ListItem[] }) {
  return (
    <ul className={styles.list}>
      {items.map((it, i) => (
        <li key={i}>
          <Spans text={it.text} />
          {it.items.length > 0 && <List items={it.items} />}
        </li>
      ))}
    </ul>
  )
}

export default function ReleaseBody({ text }: { text: string }) {
  return (
    <div className={styles.body}>
      {parseReleaseText(text).map((b, i) =>
        b.kind === 'heading' ? (
          <h3 key={i} className={styles.heading}>
            <Spans text={b.text} />
          </h3>
        ) : b.kind === 'list' ? (
          <List key={i} items={b.items} />
        ) : (
          <p key={i} className={styles.paragraph}>
            <Spans text={b.text} />
          </p>
        )
      )}
    </div>
  )
}
