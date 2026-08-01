// Resolves a trip's origin/destination/charging stops to real map
// coordinates, kept separate from TripMap.tsx's Leaflet rendering so it's
// testable without mounting a map. See specs/trip-map.md.
import cityCoordinatesData from '../data/cityCoordinates.json'
import { foldAccents } from './cities'
import type { ChargingStation, TripLog } from '../types'

const cityCoordinates = cityCoordinatesData as unknown as Record<string, [number, number]>

// Folded-name -> [lat, lng], built once so lookups are accent/case
// -insensitive without re-folding every key on every call.
const foldedCityCoordinates = new Map<string, [number, number]>(
  Object.entries(cityCoordinates).map(([name, coords]) => [foldAccents(name), coords])
)

export type TripMapPointType = 'origin' | 'destination' | 'charge'

export interface TripMapPoint {
  type: TripMapPointType
  lat: number
  lng: number
  label: string
}

export interface TripMapPoints {
  points: TripMapPoint[]
  // Charging stops that couldn't be placed on the map: no station_id, or a
  // linked station with no recorded lat/lng.
  unresolvedStopCount: number
}

function cityPoint(type: 'origin' | 'destination', cityName: string): TripMapPoint | null {
  const coords = foldedCityCoordinates.get(foldAccents(cityName))
  if (!coords) return null
  return { type, lat: coords[0], lng: coords[1], label: cityName }
}

// Builds the ordered pin list (origin -> stops -> destination) for
// TripMap, skipping anything that can't be placed geographically.
export function resolveTripMapPoints(trip: TripLog, stations: ChargingStation[]): TripMapPoints {
  const stationsById = new Map(stations.map((s) => [s.id, s]))
  const points: TripMapPoint[] = []
  let unresolvedStopCount = 0

  const origin = cityPoint('origin', trip.origin)
  if (origin) points.push(origin)

  for (const stop of trip.charging_stops) {
    const station = stop.station_id ? stationsById.get(stop.station_id) : undefined
    if (station?.lat != null && station.lng != null) {
      points.push({ type: 'charge', lat: station.lat, lng: station.lng, label: stop.name })
    } else {
      unresolvedStopCount++
    }
  }

  const destination = cityPoint('destination', trip.destination)
  if (destination) points.push(destination)

  return { points, unresolvedStopCount }
}
