import { AI_MENTORS } from '@/lib/constants'

export type Certificate = {
  id: string
  title: string
  issuedOn: string
  hours: number
  hue: string
}

export type FaqItem = { q: string; a: string }

// ─── Course learning content ──────────────────────────────────────────────
export type LearningBlockBase = {
  id: string
  title: string
}

export type VideoBlock = LearningBlockBase & {
  kind: 'video'
  description: string
  videoUrl: string
  poster: string
  durationLabel: string
}

export type SurveyOption = { id: string; label: string }

export type SurveyBlock = LearningBlockBase & {
  kind: 'survey'
  prompt: string
  options: SurveyOption[]
  reflection: string
}

export type ActionPlanBlock = LearningBlockBase & {
  kind: 'action-plan'
  prompt: string
  placeholder: string
  tip: string
}

export type LearningBlock = VideoBlock | SurveyBlock | ActionPlanBlock

export type CourseUnit = {
  id: string
  title: string
  blocks: LearningBlock[]
}

export type CourseDetail = {
  id: string
  title: string
  category: string
  cover: string
  estimatedHours: number
  description: string
  units: CourseUnit[]
}

export function getMyAiMentors() {
  return AI_MENTORS.mentors.slice(0, 4).map((m) => ({
    name: m.name,
    slug: m.slug,
    specialty: m.specialty,
    description: m.description,
    avatar: m.avatar,
  }))
}

export function getAllAiMentors() {
  return AI_MENTORS.mentors
}

export function getAiMentorBySlug(slug: string) {
  return AI_MENTORS.mentors.find((m) => m.slug === slug)
}

export const FAQS: FaqItem[] = [
  { q: 'How much does AI Amplify cost?', a: 'AI Amplify is a paid program. Contact our team for current pricing and registration details.' },
  { q: 'How do I book a session with a human mentor?', a: 'Open Human Mentors, choose a mentor that fits your needs, and click Book Session. We will email you a calendar invite.' },
  { q: 'What can the Anna chatbot do?', a: 'Anna is your AI Business Assistant — she can draft a business plan, marketing plan, product proposal, generate business ideas, and answer AI Amplify-related questions tailored to your business.' },
  { q: 'How are certificates issued?', a: 'You earn a certificate automatically when you finish a course and pass its final exam (if it has one). It appears on your Certificates page, where you can download it as an image.' },
  { q: 'Can I redeem multiple partner offers?', a: 'Yes — most offers can be stacked. Some have eligibility restrictions which are listed on the offer details page.' },
  { q: 'How do I delete my account?', a: 'Email us at info@potential.com from your registered address and we will remove your account within 7 working days.' },
]
