// Client-side "Guía" half of site search (specs/site-search.md): a static
// index built once from the curated JSON already imported elsewhere in the
// app, plus the nav labels. Deliberately kept even for sections whose
// stats/lists have gone community-first via preferCommunity() -- the
// curated prose on those pages (tips, troubleshooting, disclaimers) doesn't
// disappear when a threshold flips, so search shouldn't stop covering it
// either (see the CONTENT-MIGRATION.md note this feature added).
import accessoriesRaw from '../data/accessories.json'
import chargingRaw from '../data/charging.json'
import costsRaw from '../data/costs.json'
import fichaTecnicaRaw from '../data/ficha-tecnica.json'
import mantenimientoRaw from '../data/mantenimiento.json'
import partsRaw from '../data/parts.json'
import routesRaw from '../data/routes.json'
import techFaqRaw from '../data/tech-faq.json'
import { GUIDE_LINKS } from '../components/GuideLinks'
import { PRIMARY_NAV } from './primaryNav'
import type {
  AccessoriesData,
  ChargingData,
  CostsData,
  CuratedSearchResult,
  FichaTecnicaData,
  MantenimientoData,
  PartsData,
  RoutesData,
  TechFaqData,
  TipItem,
} from '../types'

const accessories = accessoriesRaw as AccessoriesData
const charging = chargingRaw as ChargingData
const costs = costsRaw as CostsData
const fichaTecnica = fichaTecnicaRaw as FichaTecnicaData
const mantenimiento = mantenimientoRaw as MantenimientoData
const parts = partsRaw as PartsData
const routes = routesRaw as RoutesData
const techFaq = techFaqRaw as TechFaqData

// One indexed chunk: `text` is everything matched against the query,
// `title`/`subtitle` are what a result shows. Not exported -- callers only
// need searchCuratedContent().
interface IndexEntry {
  path: string
  title: string
  subtitle?: string
  text: string
}

function tipText(items: TipItem[]): string {
  return items.map((i) => `${i.bold ?? ''} ${i.text}`).join(' ')
}

function buildIndex(): IndexEntry[] {
  const entries: IndexEntry[] = []

  for (const item of PRIMARY_NAV) {
    entries.push({ path: item.to, title: item.label, text: item.label })
  }
  for (const link of GUIDE_LINKS) {
    entries.push({ path: link.to, title: link.label, subtitle: link.description, text: `${link.label} ${link.description}` })
  }

  // /carga
  entries.push({ path: '/carga', title: charging.homeCharging.title, text: tipText(charging.homeCharging.tips) })
  entries.push({ path: '/carga', title: charging.v2l.title, text: tipText(charging.v2l.tips) })
  entries.push({ path: '/carga', title: charging.troubleshooting.title, text: tipText(charging.troubleshooting.tips) })
  entries.push({
    path: '/carga',
    title: 'Carga pública',
    text: `${charging.publicCharging.alert} ${charging.publicCharging.alerts.join(' ')}`,
  })
  for (const c of charging.publicCharging.chargers) {
    entries.push({ path: '/carga', title: c.name, subtitle: c.badge, text: `${c.name} ${c.details} ${c.tips ?? ''}` })
  }
  entries.push({
    path: '/carga',
    title: 'Autonomía',
    text: `${charging.autonomy.disclaimer} ${charging.autonomy.realConsumption.map((s) => `${s.label} ${s.value}`).join(' ')}`,
  })

  // /rutas
  entries.push({ path: '/rutas', title: 'Consejos generales de ruta', text: tipText(routes.generalTips) })
  for (const r of routes.routes) {
    entries.push({
      path: '/rutas',
      title: r.title,
      subtitle: r.distance,
      text: `${r.title} ${r.difficulty} ${r.stops.map((s) => `${s.name} ${s.note ?? ''}`).join(' ')} ${(r.tips ?? []).join(' ')}`,
    })
  }

  // /costos
  entries.push({ path: '/costos', title: 'Costo por km', text: costs.perKm.map((r) => `${r.label} ${r.value}`).join(' ') })
  for (const rc of costs.realCases) {
    entries.push({
      path: '/costos',
      title: rc.title,
      subtitle: rc.cost,
      text: `${rc.title} ${rc.period} ${rc.cost} ${rc.costPerKm} ${rc.conditions} ${rc.comparison}`,
    })
  }
  entries.push({ path: '/costos', title: 'Patente', text: `${costs.patent.note} ${costs.patent.policyNotes.join(' ')}` })
  entries.push({
    path: '/costos',
    title: 'Seguro',
    text: `${costs.insurance.disclaimer} ${costs.insurance.insurers.join(' ')}`,
  })

  // /repuestos
  entries.push({ path: '/repuestos', title: 'Repuestos', text: parts.intro })
  for (const cat of parts.categories) {
    entries.push({
      path: '/repuestos',
      title: cat.title,
      subtitle: cat.spec,
      text: `${cat.title} ${cat.spec ?? ''} ${tipText(cat.tips ?? [])}`,
    })
  }

  // /accesorios
  for (const cat of accessories.categories) {
    entries.push({ path: '/accesorios', title: cat.title, text: `${cat.title} ${tipText(cat.items)}` })
  }

  // /tecnologia
  for (const section of techFaq.tech) {
    entries.push({ path: '/tecnologia', title: section.title, text: `${section.title} ${tipText(section.items)}` })
  }

  // /faq
  for (const faq of techFaq.faq) {
    entries.push({ path: '/faq', title: faq.q, text: `${faq.q} ${faq.a}` })
  }

  // /ficha-tecnica
  for (const group of fichaTecnica.specGroups) {
    entries.push({
      path: '/ficha-tecnica',
      title: group.title,
      text: `${group.title} ${group.rows.map((r) => `${r.label} ${r.value}`).join(' ')} ${group.note ?? ''}`,
    })
  }
  for (const light of fichaTecnica.warningLights) {
    entries.push({
      path: '/ficha-tecnica',
      title: light.name,
      subtitle: 'Testigo del tablero',
      text: `${light.name} ${light.meaning}`,
    })
  }
  entries.push({ path: '/ficha-tecnica', title: 'Garantía', text: tipText(fichaTecnica.warranty) })

  // /mantenimiento
  entries.push({ path: '/mantenimiento', title: 'Service oficial', text: mantenimiento.officialNote })
  for (const item of mantenimiento.schedule) {
    entries.push({ path: '/mantenimiento', title: item.interval, text: `${item.interval} ${item.tasks.join(' ')}` })
  }
  for (const row of mantenimiento.dealerPrices) {
    entries.push({
      path: '/mantenimiento',
      title: row.service,
      subtitle: row.dealer,
      text: `${row.dealer} ${row.service} ${row.price} ${row.note ?? ''}`,
    })
  }
  for (const cat of mantenimiento.knownIssues) {
    entries.push({ path: '/mantenimiento', title: cat.title, text: `${cat.title} ${tipText(cat.items)}` })
  }

  return entries
}

// Built once on first search, not at module load, so importing this module
// (e.g. in tests) doesn't pay the cost unless a search actually happens.
let index: IndexEntry[] | null = null
function getIndex(): IndexEntry[] {
  if (!index) index = buildIndex()
  return index
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

function normalize(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim()
}

export function searchCuratedContent(query: string, limit = 10): CuratedSearchResult[] {
  const q = normalize(query)
  if (q === '') return []

  const seen = new Set<string>()
  const results: CuratedSearchResult[] = []
  for (const entry of getIndex()) {
    if (results.length >= limit) break
    if (!normalize(entry.text).includes(q)) continue
    const key = `${entry.path}::${entry.title}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ path: entry.path, title: entry.title, subtitle: entry.subtitle })
  }
  return results
}
