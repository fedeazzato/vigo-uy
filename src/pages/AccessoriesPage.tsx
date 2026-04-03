import rawData from '../data/accessories.json'
import { PageHeader, Card, CardTitle, TipList } from '../components/UI'
import type { AccessoriesData } from '../types'

const data = rawData as AccessoriesData

export default function AccessoriesPage() {
  return (
    <div>
      <PageHeader
        title="🔧 Accesorios"
        subtitle="Mejoras, adaptaciones y compras recomendadas por la comunidad."
      />

      {data.categories.map((cat) => (
        <Card key={cat.id}>
          <CardTitle icon={cat.icon}>{cat.title}</CardTitle>
          <TipList items={cat.items} />
        </Card>
      ))}
    </div>
  )
}
