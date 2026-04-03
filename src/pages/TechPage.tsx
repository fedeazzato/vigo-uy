import rawData from '../data/tech-faq.json'
import { PageHeader, Card, CardTitle, TipList } from '../components/UI'
import type { TechFaqData } from '../types'

const data = rawData as TechFaqData

export default function TechPage() {
  return (
    <div>
      <PageHeader
        title="📱 Tecnología"
        subtitle="Pantalla, modos de conducción, apps útiles y soporte técnico."
      />

      {data.tech.map((section) => (
        <Card key={section.id}>
          <CardTitle icon={section.icon}>{section.title}</CardTitle>
          <TipList items={section.items} />
        </Card>
      ))}
    </div>
  )
}
