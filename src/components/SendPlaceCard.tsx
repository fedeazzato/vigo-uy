// B2 "Enviar al auto" (specs/car-navigate-b2.md R5): any place or address. Mi Vigo card for members with a linked car: search
// (OpenStreetMap Nominatim, as the trip map's geocoding), pick a result, send it with the shared SendToCarButton.
import { useEffect, useState, type FormEvent } from 'react'
import { searchPlaces, type FoundPlace } from '../lib/nominatimGeocoding'
import { fetchCarLink } from '../lib/carNavigate'
import { Card, CardTitle } from './UI'
import SendToCarButton from './SendToCarButton'
import styles from './SendToCarButton.module.css'

export default function SendPlaceCard() {
  const [hasCar, setHasCar] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundPlace[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<FoundPlace | null>(null)

  useEffect(() => {
    let alive = true
    void fetchCarLink().then((l) => {
      if (alive) setHasCar(l.hasCar)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!hasCar) return null

  const search = async (e: FormEvent) => {
    e.preventDefault()
    setSearching(true)
    setPicked(null)
    setResults(await searchPlaces(query))
    setSearching(false)
  }

  return (
    <Card>
      <CardTitle icon="📍">Enviar un destino al auto</CardTitle>
      <p className={styles.note}>
        Buscá un lugar o una dirección y mandalo a Waze en el auto. También podés enviar estaciones de carga
        desde su mapa y paradas desde el mapa de un viaje.
      </p>
      <form onSubmit={search} className={styles.row} style={{ marginTop: 8 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej.: Plaza Independencia, Montevideo"
          aria-label="Lugar o dirección"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className={styles.send} disabled={searching || query.trim().length < 3}>
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {results && results.length === 0 && <p className={styles.note}>No encontramos ese lugar.</p>}
      {results && results.length > 0 && !picked && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setPicked(r)}
                style={{ margin: '4px 0' }}
              >
                {r.detail}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <>
          <p className={styles.dest} style={{ marginTop: 8 }}>
            {picked.detail}
          </p>
          <SendToCarButton key={`${picked.lat},${picked.lon}`} destination={picked} enabled />
        </>
      )}
    </Card>
  )
}
