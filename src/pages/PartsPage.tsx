import { PageHeader, Card, CardTitle, TipList, Badge, Alert } from '../components/UI'
import PurchaseCommunitySection from '../components/PurchaseCommunitySection'
import { useAuth } from '../context/AuthContext'
import { useCommunityContent, usePurchaseSection } from '../lib/communityData'
import { partsCatalog } from '../lib/partsCatalog'
import { isPartCategory } from '../lib/purchaseCatalog'
import styles from './PartsPage.module.css'

export default function PartsPage() {
  const { status } = useAuth()
  // Curated catalog renders immediately; community purchases fill in async.
  const { purchases: allPurchases, names, error } = useCommunityContent({
    trips: false,
    entries: false,
    purchases: true,
    limit: 50,
  })
  // part_purchases now also covers accessory purchases (AccessoriesPage) --
  // this page only shows the repuestos slice. TODO(D1): parts.json carries
  // no curated prices today (only specs/tips), so there is nothing to gate
  // yet -- if curated price references are ever added, gate them per
  // category against part_purchases counts (≥3).
  const { priceStats, recentPurchases } = usePurchaseSection(allPurchases, isPartCategory)

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

      <PurchaseCommunitySection
        itemWord="repuesto"
        signedIn={status === 'signedIn'}
        priceStats={priceStats}
        recentPurchases={recentPurchases}
        names={names}
      />
    </div>
  )
}
