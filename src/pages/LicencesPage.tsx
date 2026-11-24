import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import rawData from '../data/licences.json'
import { PageHeader, Card, CardTitle, Alert, Badge } from '../components/UI'
import styles from './LicencesPage.module.css'
import type { LicenceComponent, LicencesData } from '../types'

const data = rawData as LicencesData

const OPEN_RAIL_M_URL = 'https://huggingface.co/spaces/bigscience/license'

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

function ComponentRow({ c }: { c: LicenceComponent }) {
  return (
    <div className={styles.component}>
      <p className={styles.name}>
        {c.name}
        {c.gpl && <Badge color="amber">GPL: código fuente disponible</Badge>}
        {c.restrictions && <Badge color="blue">Con restricciones de uso</Badge>}
      </p>
      <dl className={styles.facts}>
        <dt>Versión</dt>
        <dd>{c.version}</dd>
        <dt>Licencia</dt>
        <dd>
          {c.licence} · <ExternalLink href={c.licenceUrl}>texto de la licencia</ExternalLink>
        </dd>
        <dt>Código fuente</dt>
        <dd>
          <ExternalLink href={c.sourceUrl}>{c.sourceUrl}</ExternalLink>
        </dd>
        <dt>Qué cambiamos</dt>
        <dd>{c.changes}</dd>
      </dl>
    </div>
  )
}

export default function LicencesPage() {
  return (
    <div>
      <PageHeader
        title="📜 Licencias y código fuente"
        subtitle="Programas de otros que usan nuestras apps, con su licencia y su código."
      />

      <Card>
        <CardTitle icon="ℹ️">Antes de leer</CardTitle>
        <p className={styles.text}>
          Las mejoras que instalás desde <Link to="/mi-vigo/preparar">Preparar mi Vigo</Link> usan programas y
          datos de otros proyectos. Cada uno sigue bajo su propia licencia; acá están todos, con enlaces a la
          licencia y al código fuente de la versión exacta. Última revisión: {data.updated}.
        </p>
        <Alert type="info">
          <strong>Oferta de código fuente (GPL):</strong> la app «Voz en español» incluye eSpeak NG, que tiene
          licencia GPL-3.0-or-later. El código fuente correspondiente es público y está en los enlaces de esa
          sección. Si un enlace deja de funcionar, pedinos una copia en{' '}
          <ExternalLink href="https://github.com/fedeazzato/vigo-uy/issues">
            github.com/fedeazzato/vigo-uy/issues
          </ExternalLink>{' '}
          y te la mandamos sin costo.
        </Alert>
      </Card>

      {data.groups.map((g) => (
        <Card key={g.id}>
          <CardTitle icon={g.icon}>{g.title}</CardTitle>
          <p className={styles.text}>{g.intro}</p>
          {g.components.map((c) => (
            <ComponentRow key={c.name} c={c} />
          ))}
        </Card>
      ))}

      <Card>
        <CardTitle icon="⚖️">Voces Supertonic: restricciones de uso (Open RAIL-M)</CardTitle>
        <p className={styles.text}>
          Los pesos de las voces Supertonic tienen la licencia BigScience Open RAIL-M. Se pueden usar y
          compartir gratis, pero quien los usa o los recibe acepta no usarlos para, entre otras cosas:
        </p>
        <ul className={styles.list}>
          <li>violar leyes o regulaciones nacionales o internacionales;</li>
          <li>explotar, dañar o intentar dañar a menores de edad;</li>
          <li>generar o difundir información falsa verificable con el fin de perjudicar a otros;</li>
          <li>generar o difundir datos personales que puedan usarse para dañar a alguien;</li>
          <li>difamar, menospreciar o acosar a otras personas;</li>
          <li>tomar decisiones totalmente automáticas que afecten los derechos legales de una persona;</li>
          <li>discriminar o dañar a personas o grupos por su comportamiento social o sus características;</li>
          <li>aprovecharse de la vulnerabilidad de un grupo de personas (edad, discapacidad, etc.);</li>
          <li>dar consejos médicos o interpretar resultados médicos;</li>
          <li>generar información para la administración de justicia, la policía o migraciones.</li>
        </ul>
        <p className={styles.text}>
          Este resumen no reemplaza la licencia: el texto completo, que rige y que acompaña a la voz, está en{' '}
          <ExternalLink href={OPEN_RAIL_M_URL}>{OPEN_RAIL_M_URL}</ExternalLink>. Si compartís la app con la voz,
          tenés que pasar estas mismas restricciones y una copia de la licencia.
        </p>
      </Card>

      <Card>
        <CardTitle icon="🧩">Nuestro propio código</CardTitle>
        <p className={styles.text}>
          El código de este sitio (WikiVigo) tiene licencia MIT; sus dependencias están en{' '}
          <ExternalLink href="https://github.com/fedeazzato/vigo-uy/blob/main/THIRD-PARTY-NOTICES.md">
            THIRD-PARTY-NOTICES.md
          </ExternalLink>
          .
        </p>
        <p className={styles.text}>
          El código de las apps para el auto y del instalador también tiene licencia MIT. Las partes de terceros que
          incluyen mantienen sus propias licencias (arriba).
        </p>
      </Card>
    </div>
  )
}
