// Shared catalogs for community charging stations (D4). These mirror the
// CHECK constraints on charging_stations (migrations 0022/0023) — extend
// both together.
import type { StationConnector, StationCurrentType, StationNetwork } from '../types'

// Ordered: Uruguayan networks first, then Argentina/Brazil for
// international trips, 'otro' last.
export const NETWORK_LABELS: Record<StationNetwork, string> = {
  ute: 'UTE',
  eone: 'EONE',
  dmc: 'DMC',
  evergo: 'EverGo',
  eosvolt: 'EOSVOLT',
  ypf: 'YPF (Argentina)',
  tupinamba: 'Tupinambá (Brasil)',
  zletric: 'Zletric (Brasil)',
  edp: 'EDP (Brasil)',
  otro: 'Otros',
}

export const NETWORKS = Object.keys(NETWORK_LABELS) as StationNetwork[]

export const CURRENT_TYPES: StationCurrentType[] = ['AC', 'DC']

// Which connectors a station can physically have, by current type — mirrors
// the DB constraint charging_stations_connector_matches_current (0023).
export const CONNECTORS_BY_CURRENT: Record<StationCurrentType, StationConnector[]> = {
  AC: ['Tipo 2', 'Tipo 1', 'GB/T', 'Sin cable', 'otro'],
  DC: ['CCS2', 'CCS1', 'GB/T', 'otro'],
}

export const DEFAULT_CONNECTOR: Record<StationCurrentType, StationConnector> = {
  AC: 'Tipo 2',
  DC: 'CCS2',
}
