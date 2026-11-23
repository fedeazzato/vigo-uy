import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Alert } from '../components/UI'
import styles from './PrepareCarPage.module.css'

// "Archivos de Google para el instalador" (specs/prepare-my-vigo.md, D7): which APKMirror files the owner picks for the
// installer's mandatory Waze + Google Play services step. The rules mirror the installer's own checks
// (vigo-hack/installer/windows/VigoInstaller.Waze.ps1 / VigoInstaller.Gms.ps1); no Google file is hosted or linked directly.

const search = (q: string) => `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${encodeURIComponent(q)}`

const APKMIRROR_WAZE = search('waze')
const APKMIRROR_GMS = search('google play services')
const APKMIRROR_GSF = search('google services framework')

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

export default function GoogleFilesPage() {
  return (
    <div>
      <PageHeader
        title="📥 Archivos de Google para el instalador"
        subtitle="Qué bajar de APKMirror para que el instalador ponga Waze y los servicios de Google Play en tu Vigo."
      />

      <Card>
        <CardTitle icon="ℹ️">Por qué los bajás vos</CardTitle>
        <p className={styles.text}>
          Waze y los servicios de Google Play son de Google, y Google no permite que otros los repartan. Por eso{' '}
          <strong>no vienen dentro del instalador</strong>: los bajás vos de{' '}
          <Ext href="https://www.apkmirror.com/">APKMirror</Ext>, una página conocida que publica los archivos
          originales tal cual los firma Google.
        </p>
        <p className={styles.text}>
          Son <strong>3 archivos</strong>. Cuando el instalador te pida «Elegir archivos de Google», elegí los tres
          juntos.
        </p>
        <Alert type="info">
          El instalador revisa que cada archivo tenga la <strong>firma oficial de Waze o de Google</strong>. Si
          bajaste uno equivocado o modificado, simplemente lo rechaza y te dice qué cambiar: no se instala nada raro
          en el auto. El resto de las mejoras se instala igual.
        </Alert>
      </Card>

      <Card>
        <CardTitle icon="🧭">Cómo se elige en APKMirror</CardTitle>
        <ol className={styles.list}>
          <li>Abrí el enlace de búsqueda de cada app (abajo) y entrá a la versión que se indica.</li>
          <li>
            Bajá hasta la tabla de descargas: cada fila es una «variante», con columnas de{' '}
            <strong>arquitectura</strong>, <strong>Android mínimo</strong> y <strong>DPI</strong> (pantalla).
          </li>
          <li>
            Elegí la fila que coincide con lo que se pide acá, tocá su botón de descarga y después{' '}
            <strong>«Download APK Bundle»</strong> o <strong>«Download APK»</strong>.
          </li>
          <li>
            Usá siempre los botones de la propia página de APKMirror; ignorá los avisos de publicidad que dicen
            «Download».
          </li>
        </ol>
        <p className={styles.text}>
          Las filas que son paquetes completos tienen la etiqueta <strong>BUNDLE</strong> y bajan un archivo{' '}
          <span className={styles.mono}>.apkm</span>. Las de un solo archivo tienen la etiqueta <strong>APK</strong>.
        </p>
      </Card>

      <Card>
        <CardTitle icon="1️⃣">Waze</CardTitle>
        <p className={styles.text}>
          <Ext href={APKMIRROR_WAZE}>Buscar Waze en APKMirror</Ext>
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Versión:</strong> una <strong>5.28</strong> (5.28.algo). Es la probada en la Vigo; con otra el
            instalador te avisa y te pide una segunda confirmación.
          </li>
          <li>
            <strong>Fila de la tabla:</strong> etiqueta <strong>BUNDLE</strong> (archivo{' '}
            <span className={styles.mono}>.apkm</span>), arquitectura <strong>arm64-v8a</strong>, Android mínimo{' '}
            <strong>Android 10 o anterior</strong> (por ejemplo «Android 9.0+» o «Android 10+»; no «Android 11+» ni
            más nuevo).
          </li>
          <li>
            <strong>DPI:</strong> la que incluye la pantalla <strong>xxhdpi</strong>, por ejemplo «nodpi» o
            «480-640dpi». Sin el archivo de pantalla xxhdpi Waze se cierra, y el instalador lo rechaza.
          </li>
        </ul>
      </Card>

      <Card>
        <CardTitle icon="2️⃣">Servicios de Google Play (Google Play services)</CardTitle>
        <p className={styles.text}>
          <Ext href={APKMIRROR_GMS}>Buscar Google Play services en APKMirror</Ext>
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Versión:</strong> <strong>la más nueva que sea 26.45 o mayor</strong> (26.4x o más). La probada
            en la Vigo es 26.45: una más vieja el instalador la rechaza, y una más nueva te pide una segunda
            confirmación. Evitá las que dicen <strong>beta</strong>.
          </li>
          <li>
            <strong>Fila de la tabla:</strong> etiqueta <strong>BUNDLE</strong> (archivo{' '}
            <span className={styles.mono}>.apkm</span>), arquitectura <strong>«arm64-v8a + arm-v7a»</strong>, Android
            mínimo <strong>«Android 10+»</strong> (no «Android 11+» ni más nuevo).
          </li>
          <li>
            <strong>DPI:</strong> un rango que incluya <strong>160</strong> (la pantalla de la Vigo, «mdpi»), por
            ejemplo «120-640dpi». Una fila con solo «480dpi» no sirve: le falta el archivo de pantalla mdpi, y sin
            él iniciar sesión se cierra.
          </li>
          <li>Si ves filas para Wear OS, TV o Auto, no son: elegí la de teléfono (sin esas palabras).</li>
        </ul>
      </Card>

      <Card>
        <CardTitle icon="3️⃣">Google Services Framework</CardTitle>
        <p className={styles.text}>
          <Ext href={APKMIRROR_GSF}>Buscar Google Services Framework en APKMirror</Ext>
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Versión:</strong> la de <strong>Android 10</strong> (su número empieza con «10»).
          </li>
          <li>
            <strong>Fila de la tabla:</strong> etiqueta <strong>APK</strong> (un solo archivo{' '}
            <span className={styles.mono}>.apk</span>), Android mínimo <strong>Android 10 o anterior</strong>.
          </li>
          <li>Va siempre junto con los servicios de Google Play: el instalador no acepta uno sin el otro.</li>
        </ul>
      </Card>

      <Card>
        <CardTitle icon="✅">Antes de abrir el instalador</CardTitle>
        <ul className={styles.list}>
          <li>
            Guardá los 3 archivos en una misma carpeta: dos <span className={styles.mono}>.apkm</span> (Waze y
            servicios de Google Play) y un <span className={styles.mono}>.apk</span> (Google Services Framework).
          </li>
          <li>
            No los descomprimas ni los renombres. Un <span className={styles.mono}>.zip</span> (por ejemplo
            OpenGApps) no sirve.
          </li>
          <li>Si tu pantalla ya tiene servicios de Google Play nuevos, alcanza con Waze; el instalador te lo dice.</li>
          <li>Si el instalador rechaza un archivo, leé el mensaje: dice cuál es y qué variante bajar en su lugar.</li>
        </ul>
        <p className={styles.text}>
          Volver a <Link to="/mi-vigo/preparar">Preparar mi Vigo</Link>.
        </p>
      </Card>
    </div>
  )
}
