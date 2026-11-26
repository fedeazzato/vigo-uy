import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Badge, SectionDivider, Skeleton } from '../components/UI'
import PhotoPlaceholder from '../components/PhotoPlaceholder'
import { STATUS_BADGE, installerFeatures } from '../lib/installerFeatures'
import { useInstallerFeaturesAccess } from '../lib/installerFeaturesAccess'
import type { InstallerFeature } from '../types'
import styles from './InstallerFeaturesPage.module.css'

// «Qué agrega el instalador a tu Vigo» (specs/installer-features-page.md): what the launch installer adds. The list lives in
// src/data/installerFeatures.json. For now only beta testers and moderators see it; everyone else gets «Muy pronto».

function FeatureCard({ feature }: { feature: InstallerFeature }) {
  const badge = STATUS_BADGE[feature.status]
  return (
    <Card className={styles.feature}>
      <h3 className={styles.name}>{feature.name}</h3>
      {badge && <Badge color={badge.color}>{badge.label}</Badge>}
      <p className={styles.benefit}>{feature.benefit}</p>
      <p className={styles.where}>
        <strong>Dónde lo encontrás:</strong> {feature.where}
      </p>
      {feature.needs && (
        <p className={styles.where}>
          <strong>Necesitás:</strong> {feature.needs}
        </p>
      )}
      <PhotoPlaceholder caption={feature.photo} />
    </Card>
  )
}

const TITLE = '🧩 Qué agrega el instalador a tu Vigo'

export default function InstallerFeaturesPage() {
  const access = useInstallerFeaturesAccess()
  const { groups } = installerFeatures

  if (access === 'loading') {
    return (
      <div>
        <PageHeader title={TITLE} />
        <Skeleton lines={4} />
      </div>
    )
  }

  if (access === 'denied') {
    return (
      <div>
        <PageHeader title={TITLE} />
        <Card>
          <CardTitle icon="⏳">Muy pronto</CardTitle>
          <p className={styles.benefit}>
            Estamos preparando el instalador de las mejoras de la comunidad. Cuando esté listo, acá vas a ver
            todo lo que le suma a tu Vigo. Las novedades salen en <Link to="/novedades">Novedades</Link>.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={TITLE}
        subtitle="Lo que vas a tener en la pantalla después de instalar las mejoras de la comunidad, y dónde encontrarlo en el auto."
      />

      <Card>
        <p className={styles.benefit}>
          Cada tarjeta es una mejora. Las que no tienen etiqueta las recibe todo el que instala.{' '}
          <strong>Opcional</strong>: la elegís vos al instalar. Si algo no se puede poner en tu auto, el
          instalador te dice por qué e instala el resto.
        </p>
      </Card>

      {groups.map((g) => (
        <section key={g.id} aria-label={g.title}>
          <SectionDivider label={`${g.icon} ${g.title}`} />
          <div className={styles.grid}>
            {g.features.map((f) => (
              <FeatureCard key={f.id} feature={f} />
            ))}
          </div>
        </section>
      ))}

      <SectionDivider label="↩️ Qué no cambia y qué podés deshacer" />
      <Card>
        <ul className={styles.list}>
          <li>
            <strong>El auto se maneja igual.</strong> No se toca el motor, los frenos, la dirección, la
            batería ni nada de manejo o de seguridad.
          </li>
          <li>
            <strong>Las apps de fábrica siguen ahí</strong> (Energía, Radio, Ajustes, Galería…): lo nuevo se
            les suma, y todo lo de fábrica sigue funcionando como antes.
          </li>
          <li>
            <strong>Antes de cambiar nada, el instalador guarda una copia de tus ajustes.</strong>
          </li>
          <li>
            <strong>«Quitar todo»</strong> deja la pantalla como vino de fábrica.
          </li>
          <li>
            <strong>«Antes del service»</strong> vuelve a fábrica lo que toca el sistema antes de ir al
            concesionario (si querés, también oculta las apps), y <strong>«Después del service»</strong> lo
            pone de nuevo.
          </li>
        </ul>
      </Card>

      <SectionDivider label="🧰 Qué necesitás" />
      <Card>
        <ul className={styles.list}>
          <li>Una computadora con Windows.</li>
          <li>
            Un cable USB-C para el puerto <strong>izquierdo</strong> de la consola central.
          </li>
          <li>El auto encendido y en P (no hace falta andar).</li>
          <li>Unos 20 minutos.</li>
          <li>
            Los <strong>3 archivos de Google</strong> para Waze, bajados por vos de APKMirror (y, si querés
            YouTube y Chrome, también esos): <Link to="/mi-vigo/preparar/archivos-google">cuáles bajar</Link>.
          </li>
          <li>Tu cuenta de Google, para iniciar sesión en Waze desde la pantalla.</li>
        </ul>
        <Link to="/mi-vigo/preparar" className={styles.cta}>
          Preparar mi Vigo
        </Link>
      </Card>
    </div>
  )
}
