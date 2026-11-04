'use client'

/**
 * Pieces of the Ask Anna page (the full-page concierge): the capabilities
 * rail, the phone quick-start chips, the pre-conversation greeting and the
 * reply-language strings. Every entry sends Anna a plain message, the same
 * path as typing it, so nothing here bypasses the agent.
 */

import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  History,
  Lightbulb,
  Megaphone,
  Rocket,
  Star,
  Tag,
  TrendingUp,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'
import type { LearnerLanguage } from '@/components/tutor/api'
import { SANA_AVATAR_SRC } from '@/components/learning-ui/SanaMessages'

export const ASK_LANG_KEY = 'sana.ask.lang'
export const ASK_VOICE_KEY = 'sana.ask.voiceReplies'

interface Capability {
  label: string
  message: string
  icon: LucideIcon
}

export const GOALS: Capability[] = [
  { label: 'Increase my sales', icon: TrendingUp, message: 'I want to increase my sales' },
  { label: 'Grow my brand', icon: Star, message: 'I want to grow my brand' },
  { label: 'Launch a new product', icon: Rocket, message: 'I want to launch a new product' },
  { label: 'Find new customers', icon: Users, message: 'I want to find new customers' },
]

const FIND: Capability[] = [
  { label: 'A course for my business', icon: GraduationCap, message: 'Find a course that fits my business' },
  { label: 'A mentor who knows sales', icon: Users, message: 'Find me a human mentor who knows sales' },
  { label: 'Offers I can redeem with my points', icon: Tag, message: 'Which offers can I redeem with my points?' },
  { label: 'Upcoming events and recordings', icon: CalendarDays, message: 'Show me upcoming events and recordings' },
]

const DO: Capability[] = [
  { label: 'Book a mentor session', icon: CalendarCheck, message: 'I want to book a mentor session' },
  { label: 'Show my progress and sessions', icon: History, message: 'Show my course progress and my upcoming sessions' },
  { label: 'Update my profile', icon: UserRound, message: 'I want to update my profile' },
]

// Same trigger messages as the AI tool cards, so the guided flows start the
// same way from either place.
const WRITE: Capability[] = [
  { label: 'Business ideas', icon: Lightbulb, message: 'Help me brainstorm a business idea' },
  { label: 'Business plan', icon: FileText, message: 'Help me create a business plan' },
  { label: 'Marketing plan', icon: Megaphone, message: 'Help me create a marketing plan' },
  { label: 'AI proposal', icon: Zap, message: 'Help me write a product proposal' },
]

export const QUICK: Capability[] = [
  { label: 'Find a course', icon: GraduationCap, message: 'Find a course that fits my business' },
  { label: 'Book a mentor', icon: Users, message: 'I want to book a mentor session' },
  { label: 'Offers I can redeem', icon: Tag, message: 'Which offers can I redeem with my points?' },
  { label: 'Business plan', icon: BookOpen, message: 'Help me create a business plan' },
]

function CapButton({ cap, onAsk, disabled }: { cap: Capability; onAsk: (m: string) => void; disabled?: boolean }) {
  const Icon = cap.icon
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAsk(cap.message)}
      className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-sm text-ui-text transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand disabled:opacity-50"
    >
      <Icon className="h-[18px] w-[18px] flex-none text-ui-muted" strokeWidth={1.75} aria-hidden />
      {cap.label}
    </button>
  )
}

/** Desktop rail: what Anna can do, grouped. */
export function AskSanaRail({ onAsk, disabled }: { onAsk: (message: string) => void; disabled?: boolean }) {
  return (
    <aside
      aria-label="What Anna can do"
      className="hidden w-[300px] flex-none flex-col gap-[22px] overflow-y-auto border-s border-ui-line bg-ui-surface px-3.5 py-5 xl:flex"
    >
      <section className="flex flex-col gap-2.5 px-0.5">
        <h2 className="text-[15px] font-semibold text-ui-text">Start from a goal</h2>
        <div className="flex flex-wrap gap-1.5">
          {GOALS.map((g) => (
            <button key={g.label} type="button" className="sana-chip" disabled={disabled} onClick={() => onAsk(g.message)}>
              <g.icon className="h-4 w-4 text-ui-brand-text" strokeWidth={1.75} aria-hidden />
              {g.label}
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className="px-0.5 pb-1 text-[15px] font-semibold text-ui-text">Find for me</h2>
        {FIND.map((c) => <CapButton key={c.label} cap={c} onAsk={onAsk} disabled={disabled} />)}
      </section>
      <section className="flex flex-col gap-1">
        <h2 className="px-0.5 pb-1 text-[15px] font-semibold text-ui-text">Do it for me</h2>
        {DO.map((c) => <CapButton key={c.label} cap={c} onAsk={onAsk} disabled={disabled} />)}
      </section>
      <section className="flex flex-col gap-1">
        <h2 className="px-0.5 text-[15px] font-semibold text-ui-text">Write with me</h2>
        <p className="mx-0.5 mb-1.5 text-[13px] text-ui-muted">Anna guides you step by step and emails the PDF.</p>
        {WRITE.map((c) => <CapButton key={c.label} cap={c} onAsk={onAsk} disabled={disabled} />)}
      </section>
    </aside>
  )
}

/** Phone/tablet: quick-start chips in one scrolling row above the composer. */
export function AskSanaQuickChips({ onAsk, disabled }: { onAsk: (message: string) => void; disabled?: boolean }) {
  return (
    <div className="-mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 pb-0.5 xl:hidden" role="group" aria-label="Quick starts">
      {QUICK.map((q) => (
        <button key={q.label} type="button" className="sana-chip shrink-0 whitespace-nowrap" disabled={disabled} onClick={() => onAsk(q.message)}>
          <q.icon className="h-4 w-4 text-ui-brand-text" strokeWidth={1.75} aria-hidden />
          {q.label}
        </button>
      ))}
    </div>
  )
}

export const ASK_STRINGS: Record<
  LearnerLanguage,
  { placeholder: string; placeholderShort: string; greeting: (first: string) => string; today: string; agentLanguage: string }
> = {
  en: {
    placeholder: 'Ask Anna anything, or describe a business goal',
    placeholderShort: 'Ask Anna anything',
    greeting: (first) =>
      `Hi ${first}, I'm Anna. Tell me a business goal, or ask me to find a course, a mentor, an offer or an event for you.`,
    today: 'Today',
    agentLanguage: 'English',
  },
  ar: {
    placeholder: 'اسأل سناء أي شيء، أو صف هدفًا لعملك',
    placeholderShort: 'اسأل سناء أي شيء',
    greeting: (first) =>
      `مرحبًا ${first}، أنا سناء. أخبرني بهدف لعملك، أو اطلب مني أن أجد لك دورة أو مرشدًا أو عرضًا أو فعالية.`,
    today: 'اليوم',
    agentLanguage: 'Arabic (العربية)',
  },
  hi: {
    placeholder: 'सना से कुछ भी पूछें, या अपने व्यवसाय का कोई लक्ष्य बताएँ',
    placeholderShort: 'सना से कुछ भी पूछें',
    greeting: (first) =>
      `नमस्ते ${first}, मैं सना हूँ। मुझे अपने व्यवसाय का कोई लक्ष्य बताइए, या मुझसे कोई कोर्स, मेंटर, ऑफ़र या इवेंट ढूँढने को कहिए।`,
    today: 'आज',
    agentLanguage: 'Hindi (हिन्दी)',
  },
  ur: {
    placeholder: 'ثنا سے کچھ بھی پوچھیں، یا اپنے کاروبار کا کوئی ہدف بتائیں',
    placeholderShort: 'ثنا سے کچھ بھی پوچھیں',
    greeting: (first) =>
      `السلام علیکم ${first}، میں ثنا ہوں۔ مجھے اپنے کاروبار کا کوئی ہدف بتائیں، یا مجھ سے کوئی کورس، مینٹور، آفر یا ایونٹ تلاش کرنے کو کہیں۔`,
    today: 'آج',
    agentLanguage: 'Urdu (اردو)',
  },
}

/** The pre-conversation thread: a "Today" line and Anna's greeting bubble. */
export function AskSanaGreeting({ text, today }: { text: string; today: string }) {
  return (
    <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: 'var(--sana-thread-max, 776px)' }}>
      <p className="text-center text-xs font-semibold text-ui-muted">{today}</p>
      <div className="flex items-start gap-2.5">
        <img
          src={SANA_AVATAR_SRC}
          alt="Anna"
          width={32}
          height={32}
          className="h-8 w-8 flex-shrink-0 rounded-full object-cover object-top"
        />
        <div className="sana-bubble w-fit">{text}</div>
      </div>
    </div>
  )
}
