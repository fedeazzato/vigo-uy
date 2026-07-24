// Curated parts catalog (src/data/parts.json), shared by the Repuestos page
// and purchaseCatalog.ts (which merges it with accessories.json for the
// purchase form and the category-title lookup used elsewhere).
import rawData from '../data/parts.json'
import type { PartsData } from '../types'

export const partsCatalog = rawData as PartsData
