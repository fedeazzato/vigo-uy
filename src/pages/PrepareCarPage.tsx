import { useEffect, useState } from 'react'
import { PageHeader, Card, CardTitle, Alert } from '../components/UI'
import { MASTER_CODE, factoryCode, isValidPdsn, normalizePdsn } from '../lib/vigoPass'
import styles from './PrepareCarPage.module.css'
import formStyles from '../styles/formControls.module.css'

// "Preparar mi Vigo" (specs/prepare-my-vigo.md): guides the owner through the engineering menu (Factory + Master codes) and links
// the Windows installer. The PDSN stays in component state: never sent, never stored (D2).

/** The hosted installer zip; null until it is published (D6). */
export const INSTALLER_URL: string | null = null

function PhotoPlaceholder({ caption }: { caption: string }) {
  return (
    <figure className={styles.photo}>
      <div className={styles.photoBox} aria-hidden="true">
        📷
      </div>
      <figcaption>Foto (próximamente): {caption}</figcaption>
    </figure>
  )
}

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
        subtitle="Cómo activar el modo de ingeniería de la pantalla para instalar las mejoras de la comunidad desde una computadora con Windows."
      />

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
              <strong>Antes de llevar el auto al service, usá «Quitar todo»</strong> en el instalador.
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
            <CardTitle icon="3️⃣">Activá el ADB</CardTitle>
            <p className={styles.text}>
              Se abre un menú en chino (工程调试模式). Buscá el interruptor{' '}
              <strong className={styles.mono}>adb开启</strong> y activalo. Pide una segunda contraseña:
              escribí el <strong>código maestro</strong>, que es el mismo para todas las Vigo.
            </p>
            <PhotoPlaceholder caption="el menú de ingeniería con el interruptor adb开启" />
            <Code value={MASTER_CODE} label="Código maestro" />
            <Alert type="warning">{TRIES_WARNING}</Alert>
          </Card>

          <Card>
            <CardTitle icon="4️⃣">Instalá las mejoras</CardTitle>
            <ol className={styles.list}>
              <li>Descargá el instalador y descomprimilo en la computadora.</li>
              <li>Conectá la computadora al puerto USB-C izquierdo del auto.</li>
              <li>
                Hacé doble clic en <strong>Iniciar.cmd</strong>, leé el aviso, tocá «Buscar el auto» y después
                «Instalar».
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
              la va a mostrar. Para volver todo a como vino de fábrica, repetí estos pasos y elegí «Quitar
              todo».
            </p>
            <Alert type="info">
              El ADB se apaga solo la próxima vez que se reinicia la pantalla, igual que de fábrica. Si más
              adelante querés usar el instalador otra vez, repetí los pasos 2 y 3.
            </Alert>
          </Card>
        </>
      )}
    </div>
  )
}
