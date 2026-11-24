import { PageHeader, SectionDivider } from '../components/UI'
import { GuideLinks, GUIDE_GROUPS, GUIDE_LINKS, GuideLinkItem } from '../components/GuideLinks'
import { useAuth } from '../context/AuthContext'

const MODERATION_LINK: GuideLinkItem = {
  to: '/moderacion',
  label: 'Moderación',
  icon: 'shield',
  description: 'Revisar aportes y usuarios.',
}

// "Aprender" (was "Guía", owner decision 2026-11-24 #6): the reference pages in three groups. Mi Vigo has its own tab now, so it
// is no longer listed here; Moderación is appended for moderators only.
export default function GuidePage() {
  const { profile } = useAuth()

  return (
    <div>
      <PageHeader title="📖 Aprender" subtitle="Todo lo que querés saber de tu Vigo, en un solo lugar." />
      {GUIDE_GROUPS.map((g) => (
        <section key={g.id} aria-label={g.label}>
          <SectionDivider label={g.label} />
          <GuideLinks links={GUIDE_LINKS.filter((l) => l.group === g.id)} />
        </section>
      ))}
      {profile?.is_moderator && (
        <section aria-label="Moderación">
          <SectionDivider label="Moderación" />
          <GuideLinks links={[MODERATION_LINK]} />
        </section>
      )}
    </div>
  )
}
