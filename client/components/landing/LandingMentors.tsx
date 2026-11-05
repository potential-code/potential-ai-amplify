'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  FileText,
  Lightbulb,
  Linkedin,
  Megaphone,
  Presentation,
  Send,
  type LucideIcon,
} from 'lucide-react'
import { btn, Chip, FilterChips, Skeleton } from '@/components/kit'
import { AI_MENTORS, CHATBOT } from '@/lib/constants/content'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'
import { useNarrow } from '@/lib/useNarrow'

// ── AI mentors + Anna ─────────────────────────────────────────────────────────

/** One line under each AI mentor's name (the approved landing copy). */
const AI_BLURB: Record<string, string> = {
  'sales-coach': 'Scaling enterprise sales and closing high-value deals.',
  'marketing-coach': 'Data-driven marketing to grow your brand and customer base.',
  'legal-consultant': 'Business legalities, contracts and compliance.',
  'leadership-mentor': 'Leadership skills to inspire teams and drive growth.',
  'sustainability-bot': 'Sustainable practices that reduce costs and boost reputation.',
  'corporate-security': 'Security policies and safety protocols for your business.',
}
const AI_ORDER = Object.keys(AI_BLURB)

const SANA_TOOLS: { label: string; icon: LucideIcon }[] = [
  { label: CHATBOT.capabilities[0], icon: FileText },
  { label: CHATBOT.capabilities[1], icon: Lightbulb },
  { label: CHATBOT.capabilities[2], icon: Presentation },
  { label: CHATBOT.capabilities[3], icon: Megaphone },
]

/** "Create a business plan…" style prompt, without the e.g. wrapper. */
const SANA_PLACEHOLDER = CHATBOT.placeholder.replace(/^e\.g\.\s*"?|"$/g, '')

export function LandingAiMentors() {
  const narrow = useNarrow()
  const router = useRouter()
  const mentors = [...AI_MENTORS.mentors].sort((a, b) => AI_ORDER.indexOf(a.slug) - AI_ORDER.indexOf(b.slug))

  function askSana(e: FormEvent) {
    e.preventDefault()
    router.push('/sign-up')
  }

  return (
    <section
      id="ai-mentors"
      aria-labelledby="h-ai"
      className="scroll-mt-[68px] border-y border-ui-line bg-ui-surface py-9"
    >
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-start gap-6 px-4 min-[900px]:grid-cols-2 min-[900px]:gap-10 min-[900px]:px-10">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="h-ai" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
              AI mentors
            </h2>
            <p className="text-base leading-[1.55] text-ui-muted">{AI_MENTORS.subtext.replace('our ', '')}</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3">
            {mentors.map((m) => {
              const style = { img: m.avatar, blurb: AI_BLURB[m.slug] ?? m.description }
              return (
                <li key={m.slug}>
                  {/* Amplify's mentor art carries its own text, so the label sits below it, not over it. */}
                  <Link
                    href={AI_MENTORS.ctaHref}
                    aria-label={`Chat now with ${m.name}`}
                    className="group flex h-full flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-ui"
                  >
                    <span className="block aspect-square overflow-hidden bg-[#1c1029]">
                      <img
                        src={style.img}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5 p-3">
                      <span className="text-[15px] font-semibold leading-snug text-ui-text">{m.name.replace('&', 'and')}</span>
                      <span className="line-clamp-2 text-[12px] leading-snug text-ui-muted">{style.blurb}</span>
                      <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-[12px] font-semibold text-ui-brand-text">
                        Chat now
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <div
          id="ai-assistant"
          className="flex scroll-mt-[84px] flex-col gap-4 overflow-hidden rounded-[14px] border border-ui-line bg-ui-bg p-[22px] pt-0"
        >
          <div className="relative -mx-[22px] mb-8 h-[180px] bg-[#0d0a14]">
            <img src="/images/redesign/chatbot-orb.png" alt="" className="h-full w-full object-cover object-[center_45%] opacity-90" />
            <img
              src="/images/redesign/anna-avatar-200.png"
              alt="Anna"
              className="absolute -bottom-8 left-[22px] h-[76px] w-[76px] rounded-full border-4 border-ui-bg object-cover object-top"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xl font-semibold tracking-[-0.01em] text-ui-text">Anna, your AI concierge</h3>
            <span className="text-sm text-ui-muted">One assistant for courses, mentors and business tools</span>
          </div>
          <p className="text-[15px] leading-relaxed text-ui-text">
            Ask anything. Anna generates a business plan, business idea, product proposal or marketing plan tailored
            to your needs.
          </p>
          <ul aria-label="What Anna can create" className="flex flex-wrap gap-2">
            {SANA_TOOLS.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ui-line bg-ui-surface px-3 text-[13px] font-medium text-ui-text"
              >
                <Icon className="h-[15px] w-[15px] text-ui-brand-text" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <form
            onSubmit={askSana}
            className="flex items-center gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface py-2 pl-3.5 pr-2"
          >
            <label htmlFor="lp-ask" className="sr-only">
              Ask Anna
            </label>
            <input
              id="lp-ask"
              type="text"
              placeholder={narrow ? 'Ask for a business plan' : SANA_PLACEHOLDER}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ui-text outline-none placeholder:text-ui-muted"
            />
            <button type="submit" aria-label="Sign up to chat with Anna" className={btn({ size: 'icon' })}>
              <Send className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </form>
          <p className="-mt-1.5 text-[13px] text-ui-muted">
            <Link href="/sign-up" className="font-semibold text-ui-brand-text underline">
              Sign up with your invite
            </Link>{' '}
            to chat with Anna.
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Human mentors (live from /api/mentors/public) ─────────────────────────────

const API = `/api/mentors/public`
const CATEGORIES = ['All', 'Leadership', 'Strategy', 'Marketing', 'Sales', 'Finance', 'Legal', 'Operations'] as const
type Category = (typeof CATEGORIES)[number]
const PREVIEW_COUNT = 6

const TAG_TO_CATEGORY: Record<string, Category> = {
  leadership: 'Leadership',
  'team building': 'Leadership',
  strategy: 'Strategy',
  'business development': 'Strategy',
  'business transformation': 'Strategy',
  'product development': 'Strategy',
  'project management': 'Strategy',
  marketing: 'Marketing',
  'social media': 'Marketing',
  pr: 'Marketing',
  branding: 'Marketing',
  communication: 'Marketing',
  communications: 'Marketing',
  commmunications: 'Marketing',
  'digital marketing and social media': 'Marketing',
  sales: 'Sales',
  finance: 'Finance',
  financials: 'Finance',
  accounting: 'Finance',
  auditing: 'Finance',
  tax: 'Finance',
  insurance: 'Finance',
  'finance and accounting': 'Finance',
  legal: 'Legal',
  partnerships: 'Legal',
  'company setup': 'Legal',
  ict: 'Operations',
  'design thinking': 'Operations',
  'hr and l&d': 'Operations',
  'csr and corporate affairs': 'Operations',
}

type PublicMentor = {
  id: string
  fullName: string
  avatarUrl: string | null
  linkedinUrl: string | null
  expertise: string[] | null
  bio: string | null
}

function categoriesOf(tags: string[]) {
  const out = new Set<Category>()
  for (const t of tags) {
    const c = TAG_TO_CATEGORY[t.toLowerCase().trim()]
    if (c) out.add(c)
  }
  return out
}

export function LandingHumanMentors() {
  const [mentors, setMentors] = useState<PublicMentor[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<Category>('All')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PublicMentor[]) => setMentors(Array.isArray(data) ? data : []))
      .catch(() => {
        setFailed(true)
        setMentors([])
      })
  }, [])

  const featuredFirst = useMemo(() => {
    const list = mentors ?? []
    const isFeatured = (m: PublicMentor) => (m.expertise ?? []).some((e) => /^featured$/i.test(e))
    return [...list].sort((a, b) => Number(isFeatured(b)) - Number(isFeatured(a)))
  }, [mentors])

  // The old section hid itself when the API returned nothing; keep that.
  if (mentors !== null && mentors.length === 0 && !failed) return null
  // A failed load keeps the section (the header's Mentors link points here) with a short note.
  if (failed) {
    return (
      <section id="mentors" aria-labelledby="h-mentors" className="scroll-mt-[68px] py-9">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 min-[900px]:px-10">
          <h2 id="h-mentors" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
            Human mentors
          </h2>
          <p className="text-base leading-[1.55] text-ui-muted">
            The mentor list could not load right now.{' '}
            <Link href="/sign-up" className="font-semibold text-ui-brand-text hover:underline">
              Create an account
            </Link>{' '}
            to browse every mentor and book a session.
          </p>
        </div>
      </section>
    )
  }

  const filtered =
    active === 'All' ? featuredFirst : featuredFirst.filter((m) => categoriesOf(m.expertise ?? []).has(active))
  const visible = showAll ? filtered : filtered.slice(0, PREVIEW_COUNT)

  return (
    <section id="mentors" aria-labelledby="h-mentors" className="scroll-mt-[68px] py-9">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="h-mentors" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
              Human mentors
            </h2>
            <p className="text-base leading-[1.55] text-ui-muted">
              Book private one-on-one sessions with experienced business mentors.
            </p>
          </div>
          <FilterChips
            label="Filter mentors by expertise"
            active={active}
            onChange={(v) => {
              setActive(v)
              setShowAll(false)
            }}
            className="max-w-full"
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>

        {mentors === null ? (
          <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1101px]:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-[14px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-[14px] border border-ui-line bg-ui-surface px-5 py-8 text-center text-sm text-ui-muted">
            No mentors listed for {active} yet. Try another area.
          </p>
        ) : (
          <ul aria-label="Mentors" className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1101px]:grid-cols-6">
            {visible.map((m) => {
              const tags = (m.expertise ?? []).filter((e) => !/^featured$/i.test(e))
              const featured = tags.length !== (m.expertise ?? []).length
              const specialty = m.bio ?? tags.join(', ')
              return (
                <li key={m.id} className="group flex flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
                  <div className="relative aspect-square overflow-hidden bg-ui-surface-2">
                    {m.avatarUrl ? (
                      <img
                        src={optimizedSrc(m.avatarUrl)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover object-top grayscale-[35%] transition-[filter,transform] duration-300 group-hover:scale-[1.04] group-hover:grayscale-0"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-ui-brand-soft text-3xl font-semibold text-ui-brand-text">
                        {m.fullName
                          .split(/\s+/)
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                    )}
                    {featured && (
                      <Chip tone="brand" className="absolute left-2 top-2 h-5 text-[11px] shadow-ui">
                        Featured
                      </Chip>
                    )}
                    {m.linkedinUrl && (
                      <a
                        href={m.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${m.fullName} on LinkedIn`}
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#0a66c2] shadow-ui hover:bg-white"
                      >
                        <Linkedin className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
                    <h3 className="text-[15px] font-semibold leading-snug text-ui-text">{m.fullName}</h3>
                    {specialty && <span className="line-clamp-2 text-[12px] leading-snug text-ui-muted">{specialty}</span>}
                    <Link href="/sign-up" className="mt-auto pt-1.5 text-[13px] font-semibold text-ui-brand-text hover:underline">
                      Book session
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {filtered.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="-mt-1.5 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ui-brand-text hover:underline"
          >
            {showAll ? 'Show fewer mentors' : `See all ${filtered.length} mentors`}
            <ArrowRight className={cn('h-4 w-4 transition-transform', showAll && '-rotate-90')} aria-hidden />
          </button>
        )}
      </div>
    </section>
  )
}
