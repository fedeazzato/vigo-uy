import rawData from '../data/mantenimiento.json'
import { PageHeader, Card, CardTitle, TipList, Alert, SectionDivider } from '../components/UI'
import styles from './Pages.module.css'
import type { MantenimientoData } from '../types'

const data = rawData as MantenimientoData

export default function MantenimientoPage() {
  return (
    <div>
      <PageHeader
        title="🛠️ Mantenimiento"
        subtitle="Service oficial, precios por concesionario y problemas conocidos."
      />

      <Alert type="info">{data.officialNote}</Alert>

      {data.schedule.map((item, i) => (
        <Card key={i}>
          <CardTitle icon="🗓️">{item.interval}</CardTitle>
          <ul className={styles.scheduleTasks}>
            {item.tasks.map((task, j) => (
              <li key={j} className={styles.scheduleTask}>{task}</li>
            ))}
          </ul>
        </Card>
      ))}

      <Card>
        <CardTitle icon="🌡️">Uso en condiciones severas</CardTitle>
        <TipList items={data.severeConditions} />
      </Card>

      <SectionDivider label="Precio del service por concesionario" />

      <Card>
        <div className={styles.patentTable}>
          {data.dealerPrices.map((row, i) => (
            <div key={i} className={styles.patentRow}>
              <span className={styles.patentModel}>{row.dealer}</span>
              <span className={styles.patentVal}>{row.service}{row.note ? ` — ${row.note}` : ''}</span>
              <span className={styles.patentCost}>{row.price}</span>
            </div>
          ))}
        </div>
      </Card>

      <SectionDivider label="Problemas conocidos reportados por la comunidad" />

      {data.knownIssues.map((cat) => (
        <Card key={cat.id}>
          <CardTitle icon={cat.icon}>{cat.title}</CardTitle>
          <TipList items={cat.items} />
        </Card>
      ))}

      <SectionDivider label="Seguridad y emergencias" />

      <Card>
        <TipList items={data.safety} />
      </Card>

      <Alert type="info">{data.warrantyNote}</Alert>
    </div>
  )
}
