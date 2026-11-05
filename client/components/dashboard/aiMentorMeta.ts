/**
 * Display details for the AI mentors on the redesigned pages: the order the
 * catalog is shown in, a plain-text name ("and", not "&"), the local
 * portrait (same art as the homepage) and an icon tile per specialty, used
 * as the fallback when a mentor has no portrait.
 */

import type { LucideIcon } from 'lucide-react'
import { Crown, Leaf, Megaphone, Scale, ShieldCheck, TrendingUp } from 'lucide-react'
import { getAllAiMentors } from '@/lib/dashboardData'

export interface AiMentorView {
  slug: string
  botId: string
  name: string
  specialty: string
  description: string
  icon: LucideIcon
  tile: { bg: string; fg: string }
  /** Local portrait art (compressed .webp), when the mentor has one. */
  portrait?: string
  /** Starter prompts for the chat (sent as the learner's message). */
  starters: string[]
}

const META: Record<string, { icon: LucideIcon; tile: { bg: string; fg: string }; starters: string[] }> = {
  'sales-coach': {
    icon: TrendingUp,
    tile: { bg: '#F4ECFE', fg: '#652d90' },
    starters: ['Help me qualify a prospect', 'Role-play a buyer conversation', 'Sharpen my sales pitch'],
  },
  'marketing-coach': {
    icon: Megaphone,
    tile: { bg: '#E8EEF9', fg: '#1d4e89' },
    starters: ['Plan a month of social posts', 'Who is my ideal customer?', 'Ideas for a low-budget campaign'],
  },
  'legal-consultant': {
    icon: Scale,
    tile: { bg: '#FDF1E3', fg: '#8a4513' },
    starters: ['What should a supplier contract cover?', 'Do I need to register a trademark?', 'Explain my obligations as an employer'],
  },
  'leadership-mentor': {
    icon: Crown,
    tile: { bg: '#EEE8F6', fg: '#4c1d6e' },
    starters: ['How do I delegate better?', 'Run a better weekly team meeting', 'Give difficult feedback to a staff member'],
  },
  'sustainability-bot': {
    icon: Leaf,
    tile: { bg: '#E7F4EC', fg: '#18744b' },
    starters: ['Cut my energy costs', 'Make my packaging greener', 'Write a simple sustainability policy'],
  },
  'corporate-security': {
    icon: ShieldCheck,
    tile: { bg: '#EDEFF2', fg: '#2f4858' },
    starters: ['Basic cyber security checklist', 'Protect customer data', 'Plan for an emergency at my shop'],
  },
}

/** Local portraits (AI-generated headshots) by slug; the catalog's own avatars are remote GIFs. */
const PORTRAITS: Record<string, string> = {
  'sales-coach': '/images/mentors/coaches/ai-sales.webp',
  'marketing-coach': '/images/mentors/coaches/ai-marketing.webp',
  'legal-consultant': '/images/mentors/coaches/ai-legal.webp',
  'leadership-mentor': '/images/mentors/coaches/ai-leadership.webp',
  'sustainability-bot': '/images/mentors/coaches/ai-sustainability.webp',
  'corporate-security': '/images/mentors/coaches/ai-security.webp',
}

export function aiMentorPortrait(slug: string): string | undefined {
  return PORTRAITS[slug]
}

const ORDER = ['sales-coach', 'marketing-coach', 'legal-consultant', 'leadership-mentor', 'sustainability-bot', 'corporate-security']

export function aiMentorViews(): AiMentorView[] {
  const all = getAllAiMentors()
  const rank = (slug: string) => {
    const i = ORDER.indexOf(slug)
    return i === -1 ? ORDER.length : i
  }
  return [...all]
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .map((m) => {
      const meta = META[m.slug] ?? { icon: TrendingUp, tile: { bg: '#F1F1F4', fg: '#5B5B67' }, starters: [] }
      return {
        slug: m.slug,
        botId: m.botId,
        name: m.name.replace(/\s*&\s*/g, ' and '),
        specialty: m.specialty,
        description: m.description,
        icon: meta.icon,
        tile: meta.tile,
        portrait: PORTRAITS[m.slug],
        starters: meta.starters,
      }
    })
}

export function aiMentorViewBySlug(slug: string): AiMentorView | undefined {
  return aiMentorViews().find((m) => m.slug === slug)
}

export function aiMentorViewByBotId(botId: string): AiMentorView | undefined {
  return aiMentorViews().find((m) => m.botId === botId)
}
