// Open Charge Map stations for the visible area of a stations map
// (specs/ocm-proxy.md R3). Lives inside a react-leaflet MapContainer: asks the
// `ocm-stations` Edge Function for the view (right away, then debounced on
// every move), draws the answer with the hollow ring marker and credits
// Open Charge Map in Leaflet's attribution control. What it is doing is
// reported to the parent (onState), which shows it under the map.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Popup, useMap } from 'react-leaflet'
import { ringIcon } from '../lib/mapMarkerIcon'
import {
  attributionHtml,
  connectorsText,
  fetchOcmStations,
  ocmDetailsUrl,
  ocmFunctionBase,
  ocmRequest,
  OCM_DEBOUNCE_MS,
  OCM_MAX_RETRIES,
  STATUS_LABEL,
  verifiedText,
  visibleOcmStations,
  type OcmFilter,
  type OcmStation,
} from '../lib/ocmStations'
import { Badge } from './UI'

const markerIcon = ringIcon('var(--text-secondary)')

export type OcmPhase = 'off' | 'loading' | 'zoom' | 'ready' | 'error'

export interface OcmLayerState {
  phase: OcmPhase
  /** Stations drawn (after hiding WikiVigo duplicates and removed/planned ones). */
  count: number
  complete: boolean
  message: string | null
  attribution: string | null
}

interface OcmLayerProps {
  filter: OcmFilter
  /** WikiVigo stations on the same map: an OCM station within 50 m of one is not drawn. */
  wikiStations: { lat: number; lng: number }[]
  onState: (state: OcmLayerState) => void
}

function OcmPopup({ station }: { station: OcmStation }) {
  const place = [station.operator, station.town, station.country].filter(Boolean).join(' · ')
  const verified = verifiedText(station.verified_at)
  const showStatus =
    station.status !== 'operational' && station.status !== 'available' && station.status !== 'unknown'
  return (
    <>
      <strong>{station.name}</strong> <Badge color="external">Open Charge Map</Badge>
      {place && <div>{place}</div>}
      {station.connectors.length > 0 && <div>{connectorsText(station.connectors)}</div>}
      {showStatus && <div>{STATUS_LABEL[station.status]}</div>}
      {station.restricted && <div>Acceso restringido</div>}
      {station.usage_cost && <div>Costo: {station.usage_cost}</div>}
      {verified && <div>Verificada en Open Charge Map el {verified}</div>}
      <div>
        <a href={ocmDetailsUrl(station.id)} target="_blank" rel="noopener noreferrer">
          Ver en Open Charge Map
        </a>
      </div>
    </>
  )
}

export default function OcmLayer({ filter, wikiStations, onState }: OcmLayerProps) {
  const map = useMap()
  const [stations, setStations] = useState<OcmStation[]>([])
  const [phase, setPhase] = useState<OcmPhase>('loading')
  const [complete, setComplete] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [attribution, setAttribution] = useState<string | null>(null)

  // Latest props without re-subscribing the map listeners on every render.
  const filterRef = useRef(filter)
  filterRef.current = filter
  const onStateRef = useRef(onState)
  onStateRef.current = onState
  const filterKey = JSON.stringify(filter)

  useEffect(() => {
    const base = ocmFunctionBase()
    if (!base) {
      setPhase('off')
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | null = null
    let lastCompleteUrl: string | null = null
    let retries = 0

    const run = async () => {
      const b = map.getBounds()
      const req = ocmRequest(
        base,
        { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
        filterRef.current
      )
      if (req.kind !== 'ok') {
        controller?.abort()
        lastCompleteUrl = null
        setStations([])
        setPhase(req.kind === 'too_large' ? 'zoom' : 'off')
        return
      }
      if (req.url === lastCompleteUrl) return
      controller?.abort()
      const c = new AbortController()
      controller = c
      setPhase('loading')
      const res = await fetchOcmStations(req.url, c.signal)
      if (res === null || c.signal.aborted) return
      if (!res.ok) {
        setStations([])
        setMessage(res.message)
        setPhase('error')
        return
      }
      setStations(res.answer.stations)
      setAttribution(res.answer.attribution)
      setComplete(res.answer.complete)
      setMessage(null)
      setPhase('ready')
      if (res.answer.complete) {
        lastCompleteUrl = req.url
      } else if (res.answer.retryAfter !== null && retries < OCM_MAX_RETRIES) {
        retries++
        clearTimeout(timer)
        timer = setTimeout(() => void run(), res.answer.retryAfter * 1000)
      }
    }

    const onMove = () => {
      retries = 0
      clearTimeout(timer)
      timer = setTimeout(() => void run(), OCM_DEBOUNCE_MS)
    }

    void run()
    map.on('moveend', onMove)
    return () => {
      map.off('moveend', onMove)
      clearTimeout(timer)
      controller?.abort()
    }
  }, [map, filterKey])

  const visible = useMemo(() => visibleOcmStations(stations, wikiStations), [stations, wikiStations])

  useEffect(() => {
    onStateRef.current({
      phase,
      count: phase === 'ready' ? visible.length : 0,
      complete,
      message,
      attribution: phase === 'ready' && visible.length > 0 ? attribution : null,
    })
  }, [phase, visible.length, complete, message, attribution])

  // Credit Open Charge Map in the map's own attribution control while its stations are drawn.
  const credit = phase === 'ready' && visible.length > 0 && attribution ? attributionHtml(attribution) : null
  useEffect(() => {
    const control = map.attributionControl
    if (!credit || !control) return
    control.addAttribution(credit)
    return () => {
      control.removeAttribution(credit)
    }
  }, [map, credit])

  return (
    <>
      {visible.map((s) => (
        <Marker key={`ocm-${s.id}`} position={[s.lat, s.lng]} icon={markerIcon}>
          <Popup>
            <OcmPopup station={s} />
          </Popup>
        </Marker>
      ))}
    </>
  )
}
