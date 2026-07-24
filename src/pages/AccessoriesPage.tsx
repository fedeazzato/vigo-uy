import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import rawData from '../data/accessories.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, StatGrid, SectionDivider } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { useCommunityContent, verifiedFirst } from '../lib/communityData'
import { formatCurrency } from '../lib/format'
import { isAccessoryCategory, purchaseCategoryTitle } from '../lib/purchaseCatalog'
import ContentReactions from '../components/ContentReactions'
import type { AccessoriesData, StatItem } from '../types'
// Shared with Repuestos: same "Últimas compras" list/price-stat presentation.
import styles from './PartsPage.module.css'
import listStyles from '../styles/listPatterns.module.css'

const data = rawData as AccessoriesData

const MIN_PRICE_SAMPLES = 2

export default function AccessoriesPage() {
  const { status } = useAuth()
  const { purchases: allPurchases, names, error } = useCommunityContent({
    trips: false,
    entries: false,
    purchases: true,
    limit: 50,
  })
  // part_purchases also covers repuestos (PartsPage) -- this page only
  // shows the accesorios slice.
  const purchases = useMemo(
    () => allPurchases.filter((p) => isAccessoryCategory(p.category)),
    [allPurchases]
  )

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
        label: `Precio medio · ${purchaseCategoryTitle(category)} (${prices.length})`,
      }))
  }, [purchases])

  // TODO(D1): accessories.json carries no curated prices today (only tips),
  // so there is nothing to gate yet. If curated price references are ever
  // added, gate them per category against part_purchases counts (≥3).
  const recentPurchases = verifiedFirst(purchases).slice(0, 15)

  return (
    <div>
      <PageHeader
        title="🔧 Accesorios"
        subtitle="Mejoras, adaptaciones y compras recomendadas por la comunidad."
      />

      {error && <Alert type="danger">{error}</Alert>}

      {data.categories.map((cat) => (
        <Card key={cat.id}>
          <CardTitle icon={cat.icon}>{cat.title}</CardTitle>
          <TipList items={cat.items} />
        </Card>
      ))}

      <SectionDivider label="Compras de la comunidad" />

      {supabase && (
        <Card className={listStyles.ctaCard}>
          {status === 'signedIn' ? (
            <>
              <span>¿Compraste un accesorio? Registralo para seguir tus gastos y orientar al resto.</span>
              <Link to="/repuestos/nuevo" className={listStyles.ctaBtn}>
                + Registrar compra
              </Link>
            </>
          ) : (
            <>
              <span>Iniciá sesión para registrar tus compras de accesorios y compartirlas.</span>
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
                    {p.item} <Badge color="gray">{purchaseCategoryTitle(p.category)}</Badge>
                    {p.verified && <Badge color="blue">Oficial</Badge>}
                  </div>
                  <div className={listStyles.itemMeta}>
                    {p.purchase_date} · {p.store}
                    {p.city && ` · ${p.city}`}
                    {p.rating != null && ` · ${'★'.repeat(p.rating)}`}
                    {p.link && (
                      <>
                        {' · '}
                        <a href={p.link} target="_blank" rel="noopener noreferrer nofollow ugc">
                          Ver publicación ↗
                        </a>
                      </>
                    )}
                  </div>
                  {p.notes && <div className={styles.itemNotes}>💬 {p.notes}</div>}
                  <ContentReactions content={{ kind: 'part_purchase', id: p.id }} />
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
