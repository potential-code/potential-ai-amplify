import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingCourses } from '@/components/landing/LandingCourses'
import { LandingAiMentors, LandingHumanMentors } from '@/components/landing/LandingMentors'
import { LandingEventsOffers } from '@/components/landing/LandingEventsOffers'
import { LandingStakeholders } from '@/components/landing/LandingStakeholders'
import { LandingCommunity } from '@/components/landing/LandingCommunity'
import { LandingFooter } from '@/components/landing/LandingFooter'

/** Public homepage: About folded into the hero, events and AI tools side by side. */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-ui-bg text-ui-text">
      <a
        href="#main"
        className="sr-only z-50 rounded-[10px] bg-ui-surface px-4 py-2 text-sm font-semibold text-ui-text focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main">
        <LandingHero />
        <LandingCourses />
        <LandingAiMentors />
        <LandingHumanMentors />
        <LandingEventsOffers />
        <LandingStakeholders />
        <LandingCommunity />
      </main>
      <LandingFooter />
    </div>
  )
}
