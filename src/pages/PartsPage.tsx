import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  PageHeader,
  Card,
  CardTitle,
  TipList,
  Badge,
  Alert,
  StatGrid,
  SectionDivider,
} from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { useCommunityContent, verifiedFirst } from '../lib/communityData'
import { formatCurrency } from '../lib/format'
import { partsCatalog, partCategoryTitle } from '../lib/partsCatalog'
import type { StatItem } from '../types'
import styles from './PartsPage.module.css'
import listStyles from '../styles/listPatterns.module.css'

// Minimum community purchases per category before showing an average price.
const MIN_PRICE_SAMPLES = 2

export default function PartsPage() {
  const { status } = useAuth()
  // Curated catalog renders immediately; community purchases fill in async.
  const { purchases, names, error } = useCommunityContent({
    trips: false,
    entries: false,
    purchases: true,
    limit: 50,
  })

  const priceStats: StatItem[] = useMemo(() => {
    const byCategory = new Map<string, number[]>()
    for (const p of purchases) {
      const list = byCategory.get(p.category) ?? []
      list.push(p.price_uyu)
      byCategory.set(p.category, list)
    }
    return [...byCategory.entries()]
      .filter(([, prices]) => prices.length >= MIN_PRICE_SAMPLES)
      .map(([category, prices]) => ({
        value: formatCurrency(prices.reduce((a, b) => a + b, 0) / prices.length),
        label: `Precio medio · ${partCategoryTitle(category)} (${prices.length})`,
      }))
  }, [purchases])

  // TODO(D1): parts.json carries no curated prices today (only specs/tips),
  // so there is nothing to gate yet. If curated price references are ever
  // added, gate them per category against part_purchases counts (≥3).
  const recentPurchases = verifiedFirst(purchases).slice(0, 15)

  return (
    <div>
      <PageHeader title="🔩 Repuestos y consumibles" subtitle={partsCatalog.intro} />

      {error && <Alert type="danger">{error}</Alert>}

      {partsCatalog.categories.map((cat) => (
        <Card key={cat.id}>
          <div className={styles.categoryHeader}>
            <CardTitle icon={cat.icon}>{cat.title}</CardTitle>
            <Badge color="blue">Oficial</Badge>
          </div>
          {cat.spec && <p className={styles.spec}>{cat.spec}</p>}
          {cat.tips && cat.tips.length > 0 && <TipList items={cat.tips} />}
        </Card>
      ))}

      <SectionDivider label="Compras de la comunidad" />

      {supabase && (
        <Card className={listStyles.ctaCard}>
          {status === 'signedIn' ? (
            <>
              <span>¿Compraste un repuesto? Registralo para seguir tus gastos y orientar al resto.</span>
              <Link to="/repuestos/nuevo" className={listStyles.ctaBtn}>
                + Registrar compra
              </Link>
            </>
          ) : (
            <>
              <span>Iniciá sesión para registrar tus compras de repuestos y compartirlas.</span>
              <Link to="/login" className={listStyles.ctaBtn}>
                Iniciar sesión
              </Link>
            </>
          )}
        </Card>
      )}

      {priceStats.length > 0 && (
        <Card>
          <h2 className={listStyles.sectionTitle}>Precios reales</h2>
          <StatGrid stats={priceStats} />
        </Card>
      )}

      {recentPurchases.length > 0 && (
        <Card>
          <h2 className={listStyles.sectionTitle}>Últimas compras</h2>
          <ul className={listStyles.list}>
            {recentPurchases.map((p) => (
              <li key={p.id} className={listStyles.item}>
                <div>
                  <div className={listStyles.itemTitle}>
                    {p.item} <Badge color="gray">{partCategoryTitle(p.category)}</Badge>
                    {p.verified && <Badge color="blue">Oficial</Badge>}
                  </div>
                  <div className={listStyles.itemMeta}>
                    {p.purchase_date} · {p.store}
                    {p.city && ` · ${p.city}`}
                    {p.rating != null && ` · ${'★'.repeat(p.rating)}`}
                  </div>
                  {p.notes && <div className={styles.itemNotes}>💬 {p.notes}</div>}
                </div>
                <div>
                  <div className={`${listStyles.itemCost} ${styles.itemCostRight}`}>
                    {formatCurrency(p.price_uyu)}
                  </div>
                  <div className={listStyles.author}>por {names[p.user_id] ?? 'un usuario'}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
