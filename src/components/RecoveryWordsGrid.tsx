import styles from './RecoveryWordsGrid.module.css'

// The 24 recovery words numbered in 4 columns of 6, reading down — the same
// layout the dashcam shows on the car (2 columns of 12 on narrow phones).
export default function RecoveryWordsGrid({ words }: { words: string[] }) {
  return (
    <ol className={styles.grid} aria-label="Frase de recuperación">
      {words.map((word, i) => (
        <li key={i} className={styles.word}>
          <span className={styles.number}>{i + 1}</span>
          <span>{word}</span>
        </li>
      ))}
    </ol>
  )
}
