// Merged repuestos (parts.json) + accesorios (accessories.json) categories
// for the purchase form's category picker and for labelling/filtering
// purchases by which page they belong to. One part_purchases table covers
// both catalogs -- see NewPartPurchasePage.
import accessoriesRaw from '../data/accessories.json'
import { partsCatalog } from './partsCatalog'
import type { AccessoriesData } from '../types'

const accessoriesCatalog = accessoriesRaw as AccessoriesData

const PART_IDS = new Set(partsCatalog.categories.map((c) => c.id))
const ACCESSORY_IDS = new Set(accessoriesCatalog.categories.map((c) => c.id))

export function isPartCategory(id: string): boolean {
  return PART_IDS.has(id)
}

export function isAccessoryCategory(id: string): boolean {
  return ACCESSORY_IDS.has(id)
}

const TITLE_BY_ID: Record<string, string> = Object.fromEntries([
  ...partsCatalog.categories.map((c): [string, string] => [c.id, c.title]),
  ...accessoriesCatalog.categories.map((c): [string, string] => [c.id, c.title]),
])

// Replaces the parts-only partCategoryTitle at every call site that can now
// show either kind of purchase (feed, moderation, CSV export).
export function purchaseCategoryTitle(id: string): string {
  return TITLE_BY_ID[id] ?? id
}

export interface CategoryOption {
  id: string
  icon: string
  title: string
}

// Grouped for the <select>'s two <optgroup>s, in catalog order.
export const PURCHASE_CATEGORY_GROUPS: { label: string; categories: CategoryOption[] }[] = [
  { label: 'Repuestos', categories: partsCatalog.categories.map(({ id, icon, title }) => ({ id, icon, title })) },
  {
    label: 'Accesorios',
    categories: accessoriesCatalog.categories.map(({ id, icon, title }) => ({ id, icon, title })),
  },
]
