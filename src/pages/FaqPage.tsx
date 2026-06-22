import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import rawData from '../data/tech-faq.json'
import { PageHeader } from '../components/UI'
import styles from './Pages.module.css'
import type { TechFaqData, FaqEntry } from '../types'

const data = rawData as TechFaqData

interface FaqItemProps {
  item: FaqEntry
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

function FaqItem({ item, isOpen, onToggle }: FaqItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isOpen && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isOpen])

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div ref={ref} className={`${styles.faqItem} ${isOpen ? styles.faqOpen : ''}`}>
      <button className={styles.faqQuestion} onClick={onToggle}>
        <span className={styles.faqQuestionText}>
          <span className={styles.faqIcon}>{item.icon}</span>
          {item.q}
        </span>
        <span className={styles.faqChevron}>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div className={styles.faqAnswer}>
          <p>{item.a}</p>
          <button className={styles.faqCopyLink} onClick={copyLink}>
            {copied ? '✓ Enlace copiado' : '🔗 Copiar enlace'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function FaqPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('q')

  function toggle(id: string) {
    if (openId === id) {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ q: id }, { replace: true })
    }
  }

  return (
    <div>
      <PageHeader
        title="💬 Preguntas frecuentes"
        subtitle="Las dudas más repetidas en el grupo, respondidas."
      />

      <div className={styles.faqList}>
        {data.faq.map((item: FaqEntry) => (
          <FaqItem
            key={item.id}
            item={item}
            isOpen={openId === item.id}
            onToggle={() => toggle(item.id)}
            onClose={() => setSearchParams({}, { replace: true })}
          />
        ))}
      </div>
    </div>
  )
}
