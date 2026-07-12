// Curated parts catalog (src/data/parts.json), shared by the Repuestos page,
// the purchase form (category selector) and anywhere a category slug needs a
// human title.
import rawData from '../data/parts.json'
import type { PartsData } from '../types'

export const partsCatalog = rawData as PartsData

const TITLE_BY_ID: Record<string, string> = Object.fromEntries(
  partsCatalog.categories.map((c) => [c.id, c.title])
)

export function partCategoryTitle(id: string): string {
  return TITLE_BY_ID[id] ?? id
}
