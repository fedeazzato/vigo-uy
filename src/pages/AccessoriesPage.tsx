import rawData from '../data/accessories.json'
import { PageHeader, Card, CardTitle, TipList, Alert } from '../components/UI'
import PurchaseCommunitySection from '../components/PurchaseCommunitySection'
import { useAuth } from '../context/AuthContext'
import { useCommunityContent, usePurchaseSection } from '../lib/communityData'
import { isAccessoryCategory } from '../lib/purchaseCatalog'
import type { AccessoriesData } from '../types'

const data = rawData as AccessoriesData

export default function AccessoriesPage() {
  const { status } = useAuth()
  const { purchases: allPurchases, names, error } = useCommunityContent({
    trips: false,
    entries: false,
    purchases: true,
    limit: 50,
  })
  // part_purchases also covers repuestos (PartsPage) -- this page only
  // shows the accesorios slice. TODO(D1): accessories.json carries no
  // curated prices today (only tips), so there is nothing to gate yet -- if
  // curated price references are ever added, gate them per category against
  // part_purchases counts (≥3).
  const { priceStats, recentPurchases } = usePurchaseSection(allPurchases, isAccessoryCategory)

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

      <PurchaseCommunitySection
        itemWord="accesorio"
        signedIn={status === 'signedIn'}
        priceStats={priceStats}
        recentPurchases={recentPurchases}
        names={names}
      />
    </div>
  )
}
