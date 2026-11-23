import { useEffect, useMemo, useState } from 'react'
import { Card, Badge } from './UI'
import {
  countPhases,
  effectivePercent,
  fetchCarUpdates,
  fetchReleases,
  GITHUB_DOWNLOAD_BASE,
  parseManifest,
  phaseLabel,
  publishRelease,
  setCarBeta,
  setReleaseCap,
  verifyManifestSignature,
  type CarReleaseRow,
  type CarUpdateAdminRow,
} from '../lib/carReleases'
import formStyles from '../styles/formControls.module.css'
import listStyles from '../styles/listPatterns.module.css'

// Moderation › "Versiones del auto" (specs/car-updates.md R7): publish a signed release (manifest + signature pasted from
// SignManifest.java; files already on GitHub Releases), kill switch (a pre-signed kill manifest goes through the same
// form), server-side rollout cap / pause, beta cars and the per-car status. The page never signs anything.

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function PublishForm({ onDone }: { onDone: () => void }) {
  const [channel, setChannel] = useState<'stable' | 'beta'>('beta')
  const [manifest, setManifest] = useState('')
  const [signature, setSignature] = useState('')
  const [downloadBase, setDownloadBase] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // A pasted textarea may drop the final newline: the signed bytes end with "end\n".
  const text = manifest.length > 0 && !manifest.endsWith('\n') ? manifest + '\n' : manifest
  const parsed = useMemo(() => (text ? parseManifest(text) : null), [text])
  const summary = parsed && 'summary' in parsed ? parsed.summary : null

  async function submit() {
    setMessage(null)
    if (!summary) return setMessage(parsed && 'error' in parsed ? parsed.error : 'Pegá el manifiesto.')
    if (!GITHUB_DOWNLOAD_BASE.test(downloadBase.trim()))
      return setMessage(
        'La carpeta de descarga debe ser https://github.com/<dueño>/<repo>/releases/download/<tag>/ (con la barra final).'
      )
    // the car downloads from the SIGNED "source" line (Mi Vigo 2.9, updater Manifest.blobUrl), not from this copy: they must agree
    const signedSource = /^source\s+(\S+)\s*$/m.exec(text)?.[1]
    if (signedSource !== downloadBase.trim())
      return setMessage(
        'El manifiesto firmado debe tener la línea "source <carpeta de descarga>" igual a la carpeta de arriba: el auto descarga desde esa línea firmada.'
      )
    setBusy(true)
    const ok = await verifyManifestSignature(text, signature)
    if (!ok) {
      setBusy(false)
      return setMessage(
        'La firma no corresponde a este manifiesto con ninguna clave de confianza. No se publicó nada.'
      )
    }
    const err = await publishRelease({ channel, manifest: text, signature, downloadBase, note })
    setBusy(false)
    if (err) return setMessage(err)
    setManifest('')
    setSignature('')
    setNote('')
    setMessage(null)
    onDone()
  }

  return (
    <div className={formStyles.form}>
      <div className={formStyles.row}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="rel-channel">
            Canal
          </label>
          <select
            id="rel-channel"
            className={formStyles.input}
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'stable' | 'beta')}
          >
            <option value="beta">Beta (autos de prueba)</option>
            <option value="stable">Estable (todos)</option>
          </select>
        </div>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="rel-base">
            Carpeta de descarga en GitHub Releases
          </label>
          <input
            id="rel-base"
            className={formStyles.input}
            value={downloadBase}
            placeholder="https://github.com/usuario/vigo-releases/releases/download/r42/"
            onChange={(e) => setDownloadBase(e.target.value)}
          />
        </div>
      </div>
      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor="rel-manifest">
          Manifiesto firmado (texto exacto)
        </label>
        <textarea
          id="rel-manifest"
          className={`${formStyles.input} ${formStyles.textarea}`}
          rows={8}
          spellCheck={false}
          value={manifest}
          onChange={(e) => setManifest(e.target.value)}
        />
        {parsed && 'error' in parsed && <p className={formStyles.hintWarning}>⚠️ {parsed.error}</p>}
        {summary && (
          <p className={formStyles.hint}>
            {summary.kill ? '🛑 KILL SWITCH · ' : ''}Serial {summary.serial} · rollout{' '}
            {summary.rolloutPercent} % ·{' '}
            {summary.apps.map((a) => `${a.pkg} ${a.versionName}`).join(', ') || 'sin apps'}
            {summary.notices.length > 0 && ` · avisos: ${summary.notices.map((n) => n.label).join(', ')}`} ·
            vence {new Date(summary.expires * 1000).toLocaleDateString('es-UY')}
          </p>
        )}
      </div>
      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor="rel-sig">
          Firma (base64, salida de SignManifest sign)
        </label>
        <input
          id="rel-sig"
          className={formStyles.input}
          value={signature}
          spellCheck={false}
          onChange={(e) => setSignature(e.target.value)}
        />
      </div>
      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor="rel-note">
          Nota (opcional)
        </label>
        <input
          id="rel-note"
          className={formStyles.input}
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {message && <p className={formStyles.hintWarning}>⚠️ {message}</p>}
      <button
        type="button"
        className={formStyles.submitBtnCompact}
        disabled={busy || !summary}
        onClick={() => void submit()}
      >
        {summary?.kill ? 'Publicar kill switch' : 'Verificar firma y publicar'}
      </button>
    </div>
  )
}

export default function CarReleasesAdmin() {
  const [releases, setReleases] = useState<CarReleaseRow[] | null>(null)
  const [cars, setCars] = useState<CarUpdateAdminRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [r, c] = await Promise.all([fetchReleases(), fetchCarUpdates()])
    setReleases(r.rows)
    setCars(c.rows)
    setError(r.error ?? c.error)
  }

  useEffect(() => {
    void load()
  }, [])

  async function act(p: Promise<string | null>) {
    setBusy(true)
    const err = await p
    setBusy(false)
    if (err) setError(err)
    else await load()
  }

  const newest = (channel: string) => releases?.find((r) => r.channel === channel) ?? null
  const phases = countPhases(cars)

  return (
    <>
      <Card>
        <h2 className={listStyles.sectionTitle}>📦 Versiones del auto</h2>
        <p className={formStyles.hint}>
          Los archivos van en GitHub Releases; acá solo se publica el manifiesto firmado. El auto verifica la
          firma y cada archivo. Para el kill switch, pegá el manifiesto de kill pre-firmado. Subir el
          porcentaje requiere firmar de nuevo; bajarlo o pausar se hace acá.
        </p>
        {error && <p className={formStyles.hintWarning}>⚠️ {error}</p>}
        {releases === null ? (
          <p className={listStyles.empty}>Cargando…</p>
        ) : (
          <>
            <div className={listStyles.itemMeta}>
              {(['beta', 'stable'] as const).map((ch) => {
                const r = newest(ch)
                return (
                  <div key={ch}>
                    {ch === 'beta' ? 'Beta' : 'Estable'}:{' '}
                    {r
                      ? `serial ${r.serial}${r.is_kill ? ' (kill)' : ''} · ${effectivePercent(r)} %`
                      : 'sin versiones'}
                  </div>
                )
              })}
              <div>
                Autos:{' '}
                {Object.entries(phases)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(' · ') || 'ninguno vinculado'}
              </div>
            </div>
            <ul className={listStyles.list}>
              {releases.map((r) => (
                <li key={r.id} className={listStyles.item}>
                  <div className={listStyles.itemTitle}>
                    Serial {r.serial} <Badge>{r.channel === 'beta' ? 'Beta' : 'Estable'}</Badge>
                    {r.is_kill && <Badge>Kill switch</Badge>}
                  </div>
                  <div className={listStyles.itemMeta}>
                    Rollout firmado {r.rollout_percent} %
                    {r.rollout_cap != null &&
                      ` · limitado a ${r.rollout_cap} %${r.rollout_cap === 0 ? ' (pausado)' : ''}`}
                    {' · '}publicado {fmtDate(r.created_at)} · vence {fmtDate(r.expires_at)}
                    {r.note && ` · ${r.note}`}
                  </div>
                  {!r.is_kill && (
                    <div className={listStyles.itemActions}>
                      <button
                        className={listStyles.actionLink}
                        disabled={busy}
                        onClick={() => void act(setReleaseCap(r.id, r.rollout_cap === 0 ? null : 0))}
                      >
                        {r.rollout_cap === 0 ? 'Reanudar' : 'Pausar'}
                      </button>
                      {[10, 25, 50].map((p) =>
                        p < r.rollout_percent ? (
                          <button
                            key={p}
                            className={listStyles.actionLink}
                            disabled={busy}
                            onClick={() => void act(setReleaseCap(r.id, p))}
                          >
                            Limitar a {p} %
                          </button>
                        ) : null
                      )}
                      {r.rollout_cap != null && r.rollout_cap !== 0 && (
                        <button
                          className={listStyles.actionLink}
                          disabled={busy}
                          onClick={() => void act(setReleaseCap(r.id, null))}
                        >
                          Sin límite
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <h2 className={listStyles.sectionTitle}>Publicar una versión</h2>
        <PublishForm onDone={() => void load()} />
      </Card>

      <Card>
        <h2 className={listStyles.sectionTitle}>🚗 Autos vinculados</h2>
        {cars.length === 0 ? (
          <p className={listStyles.empty}>Ningún auto vinculado todavía.</p>
        ) : (
          <ul className={listStyles.list}>
            {cars.map((c) => (
              <li key={c.vehicle_id} className={listStyles.item}>
                <div className={listStyles.itemTitle}>
                  {c.members || 'Auto sin miembros'} {c.beta && <Badge>Beta</Badge>}
                </div>
                <div className={listStyles.itemMeta}>
                  {phaseLabel(c.phase)} · serial {c.serial ?? '—'}
                  {c.offered_serial != null &&
                    c.offered_serial !== c.serial &&
                    ` (ofrecido ${c.offered_serial})`}{' '}
                  · última consulta {fmtDate(c.checked_at)}
                  {c.firmware && ` · ${c.firmware}`}
                  {c.last_line && <div>{c.last_line}</div>}
                </div>
                <div className={listStyles.itemActions}>
                  <button
                    className={listStyles.actionLink}
                    disabled={busy}
                    onClick={() => void act(setCarBeta(c.vehicle_id, !c.beta))}
                  >
                    {c.beta ? 'Quitar de beta' : 'Marcar como beta'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
