import rawData from '../data/ficha-tecnica.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, SectionDivider } from '../components/UI'
import { useUserPrefs } from '../context/UserPrefsContext'
import styles from './Pages.module.css'
import type { FichaTecnicaData, LightSeverity } from '../types'

const data = rawData as FichaTecnicaData

const SEVERITY_LABEL: Record<LightSeverity, string> = {
  danger: 'Requiere service',
  warning: 'Advertencia',
  info: 'Indicador de estado',
}

const SEVERITY_BADGE: Record<LightSeverity, string> = {
  danger: 'red',
  warning: 'amber',
  info: 'green',
}

export default function FichaTecnicaPage() {
  const { model } = useUserPrefs()
  const groupedLights = (['danger', 'warning', 'info'] as LightSeverity[]).map((sev) => ({
    severity: sev,
    lights: data.warningLights.filter((l) => l.severity === sev),
  }))

  return (
    <div>
      <PageHeader
        title="📋 Ficha técnica"
        subtitle="Especificaciones oficiales del manual Dongfeng VIGO (mercado Uruguay)."
      />

      {data.specGroups.map((group) => {
        const visibleRows = model
          ? group.rows.filter((r) => !r.model || r.model === model)
          : group.rows

        return (
          <Card key={group.id}>
            <div className={styles.specGroupHeader}>
              <CardTitle icon={group.icon}>{group.title}</CardTitle>
              {group.note && <Badge color="blue">Manual oficial</Badge>}
            </div>
            <div className={styles.priceTable}>
              {visibleRows.map((row, i) => (
                <div key={i} className={styles.priceRow}>
                  <div className={styles.priceLabel}>{row.label}</div>
                  <div className={styles.priceValue}>{row.value}</div>
                </div>
              ))}
            </div>
            {group.note && <Alert type="info">{group.note}</Alert>}
          </Card>
        )
      })}

      <SectionDivider label="Advertencias del tablero" />

      {groupedLights.map(({ severity, lights }) => (
        <Card key={severity}>
          <CardTitle icon={severity === 'danger' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'}>
            {SEVERITY_LABEL[severity]}
          </CardTitle>
          {lights.map((light, i) => (
            <div key={i} className={styles.lightRow}>
              <div className={styles.lightHeader}>
                <span className={styles.lightName}>{light.icon} {light.name}</span>
                <Badge color={SEVERITY_BADGE[severity]}>{SEVERITY_LABEL[severity]}</Badge>
              </div>
              <p className={styles.lightMeaning}>{light.meaning}</p>
            </div>
          ))}
        </Card>
      ))}

      <SectionDivider label="Identificación del vehículo" />

      <Card>
        <CardTitle icon="🔎">VIN y puertos de diagnóstico</CardTitle>
        <TipList items={data.vinLocations.map((v) => ({ bold: `${v.label}:`, text: v.text }))} />
      </Card>

      <SectionDivider label="Garantía" />

      <Card>
        <CardTitle icon="📝">Términos de garantía</CardTitle>
        <TipList items={data.warranty} />
      </Card>
    </div>
  )
}
