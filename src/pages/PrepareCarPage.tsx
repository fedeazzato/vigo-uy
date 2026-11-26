import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Alert } from '../components/UI'
import { MASTER_CODE, factoryCode, isValidPdsn, normalizePdsn } from '../lib/vigoPass'
import styles from './PrepareCarPage.module.css'
import formStyles from '../styles/formControls.module.css'
import GlossaryLink from '../components/GlossaryLink'
import PhotoPlaceholder from '../components/PhotoPlaceholder'
import { INSTALLER_FEATURES_PATH } from '../lib/installerFeatures'

// "Preparar mi Vigo" (specs/prepare-my-vigo.md): guides the owner through the engineering menu (Factory + Master codes) and links
// the Windows installer. The PDSN stays in component state: never sent, never stored (D2).

/** The hosted installer zip; null until it is published (D6). */
export const INSTALLER_URL: string | null = null

function Code({ value, label }: { value: string; label: string }) {
  return (
    <p className={styles.code} aria-label={label}>
      {value}
    </p>
  )
}

const TRIES_WARNING =
  'Escribilo exactamente igual. Cada pantalla se bloquea después de unos 5 intentos fallidos: si falla dos veces, pará y revisá antes de seguir.'

export default function PrepareCarPage() {
  const [accepted, setAccepted] = useState(false)
  const [raw, setRaw] = useState('')
  const [factory, setFactory] = useState<string | null>(null)
  const pdsn = normalizePdsn(raw)
  const valid = isValidPdsn(pdsn)

  useEffect(() => {
    let cancelled = false
    if (!valid) {
      setFactory(null)
      return
    }
    void factoryCode(pdsn).then((code) => {
      if (!cancelled) setFactory(code)
    })
    return () => {
      cancelled = true
    }
  }, [pdsn, valid])

  return (
    <div>
      <PageHeader
        title="🛠️ Preparar mi Vigo"
        subtitle="Paso a paso para sumarle las apps de la comunidad a tu pantalla, con una computadora con Windows. Primero se abre un menú oculto de la pantalla (el «modo de ingeniería»)."
      />

      <Card>
        <CardTitle icon="👀">Antes de empezar, mirá qué vas a tener</CardTitle>
        <p className={styles.text}>
          Waze, Android Auto sin cable, Copiloto, Carga dentro de Energía, la Dashcam, Mi Vigo, la Radio y la Galería mejoradas, las apps
          de fábrica en español y más: una tarjeta por cada cosa que suma el instalador, con dónde la encontrás
          en el auto.
        </p>
        <Link to={INSTALLER_FEATURES_PATH} className={styles.featuresLink}>
          Qué agrega el instalador a tu Vigo
        </Link>
      </Card>

      <Card>
        <CardTitle icon="⚠️">Antes de empezar: leé esto</CardTitle>
        <div className={styles.disclaimer}>
          <p>
            Estas mejoras son <strong>software hecho por la comunidad de dueños de la Vigo</strong>, gratis y
            sin fines de lucro. <strong>No son de Dongfeng ni del concesionario</strong>, y nadie de ellos las
            revisó ni las respalda.
          </p>
          <h3>Qué cambia en tu auto</h3>
          <ul>
            <li>
              Para instalarlas hay que activar el modo de ingeniería de la pantalla y darle al instalador
              acceso de administrador («root»).
            </li>
            <li>
              El instalador <strong>agrega aplicaciones y ajustes al sistema de la pantalla central</strong>.
              No toca el motor, los frenos, la dirección, la batería ni ningún sistema de manejo o de
              seguridad del auto.
            </li>
            <li>
              Algunas funciones (por ejemplo Copiloto, que puede abrir ventanillas o encender el aire) mandan
              órdenes al auto{' '}
              <strong>con los mismos límites de seguridad que tiene la pantalla de fábrica</strong>: las
              ventanillas solo con el auto detenido, y nada de luces, puertas ni manejo.
            </li>
          </ul>
          <h3>Riesgos que aceptás</h3>
          <ul>
            <li>
              <strong>Garantía:</strong> modificar el software del auto puede afectar la garantía del
              fabricante o del concesionario. Es tu decisión.
            </li>
            <li>
              <strong>Fallas:</strong> como cualquier software, puede tener errores. En el peor caso la
              pantalla podría reiniciarse o una función dejar de andar. Nada de esto afecta la capacidad de
              manejar el auto, pero sí puede afectar funciones de la pantalla mientras lo arreglás.
            </li>
            <li>
              <strong>Actualizaciones del concesionario:</strong> una actualización oficial puede borrar estas
              mejoras o hacer que dejen de funcionar.{' '}
              <strong>Antes de llevar el auto al service, usá «Antes del service»</strong> (o «Quitar todo»)
              en el instalador.
            </li>
          </ul>
          <h3>Waze y la cuenta de Google</h3>
          <ul>
            <li>
              Waze y los servicios de Google Play son de Google y no vienen en el instalador: los bajás vos de
              APKMirror y el instalador solo verifica que estén firmados por Waze y por Google.
            </li>
            <li>
              La pantalla de la Vigo no está certificada por Google. Iniciar sesión con tu cuenta de Google en
              ella puede ir en contra de las condiciones de Google, y Google puede pedirte verificaciones
              extra o no dejarte entrar. Es tu decisión y tu cuenta.
            </li>
            <li>
              «Quitar todo» borra los servicios de Google Play que puso el instalador y con ellos tu cuenta de
              Google en la pantalla (la cuenta sigue existiendo; solo sale de la pantalla). Si el instalador
              había actualizado unos que ya tenías, vuelven los anteriores.
            </li>
          </ul>
          <h3>Lo que sí te garantizamos</h3>
          <ul>
            <li>
              <strong>Todo se puede quitar.</strong> El instalador tiene «Quitar todo», que deja la pantalla
              como vino de fábrica.
            </li>
            <li>
              <strong>Antes de cambiar nada, el instalador guarda una copia de tus ajustes</strong> para poder
              volver atrás.
            </li>
            <li>
              <strong>Tus datos son tuyos.</strong> Las apps no mandan nada a quienes las hacemos. Lo que
              elijas compartir con WikiVigo (por ejemplo el estado de la batería o tus viajes) va a tu propia
              cuenta y lo podés apagar cuando quieras.
            </li>
          </ul>
          <h3>Sin garantía</h3>
          <p>
            Las mejoras se ofrecen «tal cual», sin garantía de ningún tipo. En la máxima medida que permite la
            ley, quienes las hacemos no somos responsables por daños o pérdidas derivados de instalarlas o
            usarlas. Si algo no anda, avisanos y te ayudamos en lo que podamos, sin plazos prometidos.
          </p>
          <p>
            <strong>Contacto:</strong>{' '}
            <a href="https://github.com/fedeazzato/vigo-uy/issues" target="_blank" rel="noreferrer">
              github.com/fedeazzato/vigo-uy/issues
            </a>
          </p>
          <p>
            <strong>Licencias:</strong> las apps usan programas y datos de otros proyectos, cada uno con su
            licencia. Están todos, con su código fuente, en{' '}
            <a href="#/licencias">Licencias y código fuente</a>.
          </p>
        </div>
        <label className={styles.accept}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>Leí todo esto, entiendo los riesgos y quiero instalar las mejoras en mi auto.</span>
        </label>
      </Card>

      {accepted && (
        <>
          <Card>
            <CardTitle icon="🧰">Qué necesitás</CardTitle>
            <ul className={styles.list}>
              <li>El auto encendido y en P (no hace falta andar).</li>
              <li>Una computadora con Windows.</li>
              <li>
                Un cable USB-C para el puerto <strong>izquierdo</strong> de la consola central (el derecho no
                sirve para esto).
              </li>
              <li>
                Los <strong>3 archivos de Google</strong> (Waze, servicios de Google Play y Google Services
                Framework), bajados de APKMirror:{' '}
                <Link to="/mi-vigo/preparar/archivos-google">cuáles bajar</Link>.
              </li>
              <li>Tu cuenta de Google (para iniciar sesión en Waze desde la pantalla).</li>
              <li>Unos 20 minutos.</li>
            </ul>
          </Card>

          <Card>
            <CardTitle icon="1️⃣">Buscá el número de serie (PDSN)</CardTitle>
            <p className={styles.text}>
              En la pantalla del auto: <strong>Ajustes › Información del vehículo › Acerca del IVI</strong>,
              línea <strong>«Número de serie PDSN»</strong>. Escribilo acá tal cual lo ves.
            </p>
            <PhotoPlaceholder caption="la pantalla «Acerca del IVI» con el número de serie PDSN" />
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="pdsn">
                Número de serie PDSN
              </label>
              <input
                id="pdsn"
                className={`${formStyles.input} ${styles.pdsnInput}`}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <p className={formStyles.hint}>
                Se calcula en tu navegador: el número no se envía a WikiVigo ni se guarda.
              </p>
              {pdsn.length > 0 && !valid && (
                <p className={formStyles.hintWarning}>
                  El número de serie tiene solo letras y números (al menos 6).
                </p>
              )}
              {valid && /[a-z]/.test(pdsn) && (
                <p className={formStyles.hintWarning}>
                  Escribiste letras minúsculas: revisá si en la pantalla están en mayúsculas, porque el código
                  cambia.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle icon="2️⃣">Entrá al modo de ingeniería</CardTitle>
            <p className={styles.text}>
              Andá a <strong>Ajustes › Sistema</strong> y tocá unas <strong>7 veces seguidas</strong> la línea
              de la versión de software. Aparece un cuadro que pide una contraseña: escribí el{' '}
              <strong>código de fábrica</strong>.
            </p>
            <PhotoPlaceholder caption="la línea de versión de software y el cuadro de contraseña" />
            {factory ? (
              <>
                <p className={styles.echo}>
                  Código de fábrica para el PDSN <span className={styles.mono}>{pdsn}</span>:
                </p>
                <Code value={factory} label="Código de fábrica" />
              </>
            ) : (
              <p className={styles.text}>Escribí el PDSN en el paso 1 para ver tu código de fábrica.</p>
            )}
            <Alert type="warning">{TRIES_WARNING}</Alert>
            <p className={styles.hintCase}>
              Empieza con <span className={styles.mono}>DfCs</span> (D y C mayúsculas), sigue con letras
              minúsculas y números, y termina con <span className={styles.mono}>#!</span>.
            </p>
          </Card>

          <Card>
            <CardTitle icon="3️⃣">Abrí la conexión del instalador</CardTitle>
            <p className={styles.text}>
              Es la puerta por cable que usa el instalador (<GlossaryLink term="adb">qué es</GlossaryLink>). Se abre un menú
              en chino (工程调试模式). Buscá el interruptor <strong className={styles.mono}>adb开启</strong> y
              activalo. Pide una segunda contraseña: escribí el <strong>código maestro</strong>, que es el
              mismo para todas las Vigo.
            </p>
            <PhotoPlaceholder caption="el menú de ingeniería con el interruptor adb开启" />
            <Code value={MASTER_CODE} label="Código maestro" />
            <Alert type="warning">{TRIES_WARNING}</Alert>
          </Card>

          <Card>
            <CardTitle icon="4️⃣">Instalá las mejoras</CardTitle>
            <p className={styles.text}>
              ¿Qué vas a tener después? Mirá <Link to={INSTALLER_FEATURES_PATH}>qué agrega el instalador</Link>.
            </p>
            <ol className={styles.list}>
              <li>Descargá el instalador y descomprimilo en la computadora.</li>
              <li>Conectá la computadora al puerto USB-C izquierdo del auto.</li>
              <li>
                Hacé doble clic en <strong>Iniciar.cmd</strong>, leé el aviso, tocá «Buscar el auto» y después
                «Instalar».
              </li>
              <li>
                El instalador te pide los archivos de Google: elegí juntos los 3 que bajaste (
                <Link to="/mi-vigo/preparar/archivos-google">Archivos de Google para el instalador</Link>).
              </li>
              <li>Al terminar, tocá «Reiniciar la pantalla».</li>
            </ol>
            {INSTALLER_URL ? (
              <a className={styles.download} href={INSTALLER_URL}>
                Descargar el instalador para Windows
              </a>
            ) : (
              <button type="button" className={styles.download} disabled>
                Descargar el instalador para Windows · Próximamente
              </button>
            )}
            <p className={styles.text}>
              El instalador calcula solo la contraseña de administrador del auto; no tenés que escribirla ni
              la va a mostrar.
            </p>
            <p className={styles.text}>
              <strong>Waze y Google no vienen en el instalador</strong> (son de Google): los elegís vos. El
              instalador revisa que sean los originales y rechaza un archivo equivocado. Si Waze no se puede
              poner, te dice por qué y el resto se instala igual.
            </p>
          </Card>

          <Card>
            <CardTitle icon="5️⃣">Iniciá sesión en Waze</CardTitle>
            <p className={styles.text}>
              Después del reinicio, abrí Waze en la pantalla del auto e iniciá sesión con tu cuenta de Google,
              directamente en la pantalla. Si Google te pide una llave de acceso («passkey»), tocá{' '}
              <strong>«Probar otra manera»</strong> y elegí la contraseña u otro método.
            </p>
          </Card>

          <Card>
            <CardTitle icon="🔁">Los otros botones del instalador</CardTitle>
            <ul className={styles.list}>
              <li>
                <strong>«Quitar todo»</strong>: deja la pantalla como vino de fábrica. Saca todas las mejoras,
                Waze y los servicios de Google Play que puso el instalador (con ellos sale tu cuenta de Google
                de la pantalla; la cuenta sigue existiendo).
              </li>
              <li>
                <strong>«Antes del service»</strong>: usalo antes de llevar el auto al concesionario. Guarda
                una copia de tus ajustes y vuelve a fábrica el cambio de sistema, las apps de fábrica que el
                instalador mejoró (Energía, Radio, Galería, pantalla de inicio) y el asistente de voz; las
                apps nuevas quedan. Si a «¿Ocultar también las apps?» respondés <strong>Sí</strong>, hace lo mismo
                que «Quitar todo»: saca todo, incluidos Waze y Google.
              </li>
              <li>
                <strong>«Después del service»</strong>: cuando el auto vuelve, instala todo de nuevo y te
                ofrece recuperar tus ajustes de antes del service, preguntándote uno por uno los de seguridad.
              </li>
            </ul>
            <Alert type="info">
              Esta conexión (<strong className={styles.mono}>adb开启</strong>) se apaga sola cuando se reinicia la pantalla. Para usar el instalador otra vez, repetí
              los pasos 2 y 3.
            </Alert>
          </Card>
        </>
      )}
    </div>
  )
}
