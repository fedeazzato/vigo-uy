import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, StatGrid, SectionDivider } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { useCommunityContent } from '../lib/communityData'
import { partsCatalog, partCategoryTitle } from '../lib/partsCatalog'
import type { StatItem } from '../types'
import styles from './PartsPage.module.css'

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
        value: `$${Math.round(prices.reduce((a, b) => a + b, 0) / prices.length).toLocaleString('es-UY')}`,
        label: `Precio medio · ${partCategoryTitle(category)} (${prices.length})`,
      }))
  }, [purchases])

  const recentPurchases = purchases.slice(0, 15)

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
        <Card className={styles.ctaCard}>
          {status === 'signedIn' ? (
            <>
              <span>¿Compraste un repuesto? Registralo para seguir tus gastos y orientar al resto.</span>
              <Link to="/repuestos/nuevo" className={styles.ctaBtn}>+ Registrar compra</Link>
            </>
          ) : (
            <>
              <span>Iniciá sesión para registrar tus compras de repuestos y compartirlas.</span>
              <Link to="/login" className={styles.ctaBtn}>Iniciar sesión</Link>
            </>
          )}
        </Card>
      )}

      {priceStats.length > 0 && (
        <Card>
          <h2 className={styles.sectionTitle}>Precios reales</h2>
          <StatGrid stats={priceStats} />
        </Card>
      )}

      {recentPurchases.length > 0 && (
        <Card>
          <h2 className={styles.sectionTitle}>Últimas compras</h2>
          <ul className={styles.list}>
            {recentPurchases.map((p) => (
              <li key={p.id} className={styles.item}>
                <div>
                  <div className={styles.itemTitle}>
                    {p.item} <Badge color="gray">{partCategoryTitle(p.category)}</Badge>
                  </div>
                  <div className={styles.itemMeta}>
                    {p.purchase_date} · {p.store}
                    {p.city && ` · ${p.city}`}
                    {p.rating != null && ` · ${'★'.repeat(p.rating)}`}
                  </div>
                  {p.notes && <div className={styles.itemNotes}>💬 {p.notes}</div>}
                </div>
                <div>
                  <div className={styles.itemCost}>
                    ${p.price_uyu.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                  </div>
                  <div className={styles.author}>por {names[p.user_id] ?? 'un usuario'}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
