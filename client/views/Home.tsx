import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from '@/components/sections/HeroSection'
import { AboutSection } from '@/components/sections/AboutSection'
import { JourneySection } from '@/components/sections/JourneySection'
import { StakeholderSection } from '@/components/sections/StakeholderSection'
import { CoursesSection } from '@/components/sections/CoursesSection'
import { LiveEventsSection } from '@/components/sections/LiveEventsSection'
import { AiMentorsSection } from '@/components/sections/AiMentorsSection'
import { ChatbotSection } from '@/components/sections/ChatbotSection'
import { HumanMentorsSection } from '@/components/sections/HumanMentorsSection'
import { SpecialOffersSection } from '@/components/sections/SpecialOffersSection'
import { TestimonialsSection } from '@/components/sections/TestimonialsSection'
import { CtaFinalSection } from '@/components/sections/CtaFinalSection'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <AboutSection />
        <JourneySection />
        <StakeholderSection />
        <CoursesSection />
        <LiveEventsSection />
        <AiMentorsSection />
        <ChatbotSection />
        <HumanMentorsSection />
        <SpecialOffersSection />
        <TestimonialsSection />
        <CtaFinalSection />
      </main>
      <Footer />
    </>
  )
}
