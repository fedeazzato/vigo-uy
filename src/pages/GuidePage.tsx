import { PageHeader } from '../components/UI'
import { GuideLinks, GUIDE_LINKS, GuideLinkItem } from '../components/GuideLinks'
import { useAuth } from '../context/AuthContext'

// Mi Vigo lives here (not on the mobile tab bar), so it stays reachable in
// two taps on mobile. Moderación is appended for moderators only.
const MI_VIGO_LINK: GuideLinkItem = {
  to: '/mi-vigo',
  label: 'Mi Vigo',
  icon: '🚗',
  description: 'Configurá tu modelo, tu color y tu cuenta.',
}

const MODERATION_LINK: GuideLinkItem = {
  to: '/moderacion',
  label: 'Moderación',
  icon: '🛡️',
  description: 'Gestión de contenido y usuarios.',
}

export default function GuidePage() {
  const { profile } = useAuth()

  const links = [...GUIDE_LINKS, MI_VIGO_LINK, ...(profile?.is_moderator ? [MODERATION_LINK] : [])]

  return (
    <div>
      <PageHeader title="📖 Guía" subtitle="Toda la información de referencia sobre el Vigo E2 y E2+." />
      <GuideLinks links={links} />
    </div>
  )
}
