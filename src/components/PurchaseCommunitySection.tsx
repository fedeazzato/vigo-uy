// Shared "Compras de la comunidad" block (CTA, price stats, recent purchase
// list) rendered identically by PartsPage and AccessoriesPage -- they filter
// the same part_purchases table down to different category slices, then
// both display the result the same way. Reuses PartsPage.module.css's
// itemNotes/itemCostRight classes rather than duplicating them, matching how
// AccessoriesPage already borrowed that stylesheet before this extraction.
import { Link } from 'react-router-dom'
import { Card, Badge, StatGrid, SectionDivider } from './UI'
import ContentReactions from './ContentReactions'
import { formatCurrency } from '../lib/format'
import { purchaseCategoryTitle } from '../lib/purchaseCatalog'
import { supabase } from '../lib/supabaseClient'
import styles from '../pages/PartsPage.module.css'
import listStyles from '../styles/listPatterns.module.css'
import type { PartPurchase, StatItem } from '../types'

interface PurchaseCommunitySectionProps {
  // Singular noun feeding the CTA copy, e.g. "accesorio" / "repuesto".
  itemWord: string
  signedIn: boolean
  priceStats: StatItem[]
  recentPurchases: PartPurchase[]
  names: Record<string, string>
}

export default function PurchaseCommunitySection({
  itemWord,
  signedIn,
  priceStats,
  recentPurchases,
  names,
}: PurchaseCommunitySectionProps) {
  return (
    <>
      <SectionDivider label="Compras de la comunidad" />

      {supabase && (
        <Card className={listStyles.ctaCard}>
          {signedIn ? (
            <>
              <span>¿Compraste un {itemWord}? Registralo para seguir tus gastos y orientar al resto.</span>
              <Link to="/repuestos/nuevo" className={listStyles.ctaBtn}>
                + Registrar compra
              </Link>
            </>
          ) : (
            <>
              <span>Iniciá sesión para registrar tus compras de {itemWord}s y compartirlas.</span>
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
    </>
  )
}
