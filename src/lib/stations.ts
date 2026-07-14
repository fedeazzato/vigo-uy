// Shared catalogs for community charging stations (D4). Networks live in
// the charging_networks table (0024) and are fetched at runtime; only the
// physics stays hardcoded here.
import type { NetworkCountry, StationConnector, StationCurrentType } from '../types'

export const CURRENT_TYPES: StationCurrentType[] = ['AC', 'DC']

// Which connectors a station can physically have, by current type — mirrors
// the DB constraint charging_stations_connector_matches_current (0025).
export const CONNECTORS_BY_CURRENT: Record<StationCurrentType, StationConnector[]> = {
  AC: ['Tipo 2', 'Tipo 1', 'GB/T', 'Sin cable'],
  DC: ['CCS2', 'CCS1', 'GB/T', 'Sin cable'],
}

export const DEFAULT_CONNECTOR: Record<StationCurrentType, StationConnector> = {
  AC: 'Tipo 2',
  DC: 'CCS2',
}

export const COUNTRY_LABELS: Record<NetworkCountry, string> = {
  UY: 'Uruguay',
  AR: 'Argentina',
  BR: 'Brasil',
  otro: 'Otros',
}

export const COUNTRIES: NetworkCountry[] = ['UY', 'AR', 'BR', 'otro']
