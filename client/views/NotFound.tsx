'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Home,
  LayoutDashboard,
  Search,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { btn } from '@/components/kit'
import { getUser, homeFor, type User } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useNarrow } from '@/lib/useNarrow'

type Dest = { label: string; meta: string; href: string; icon: LucideIcon; keywords: string }

/** Where a lost visitor can go. Signed-in learners get their app pages; everyone else the public sections. */
function destinationsFor(user: User | null): Dest[] {
  const learner = user?.role === 'sme'
  const home = user ? homeFor(user.role) : '/dashboard'
  const list: Dest[] = [
    {
      label: 'Courses',
      meta: 'Six core AI courses and more',
      href: learner ? '/dashboard/courses' : '/#courses',
      icon: GraduationCap,
      keywords: 'course courses learn learning lesson unit exam certificate',
    },
    {
      label: 'Mentors',
      meta: 'AI and human',
      href: learner ? '/dashboard/human-mentors' : '/#ai-mentors',
      icon: Users,
      keywords: 'mentor mentors coach ai human session book',
    },
    {
      label: 'Events',
      meta: 'Webinars and recordings',
      href: learner ? '/dashboard/events' : '/#events',
      icon: CalendarDays,
      keywords: 'event events webinar webinars recording live',
    },
    {
      label: 'Offers',
      meta: 'Partner discounts',
      href: learner ? '/dashboard/offers' : '/#offers',
      icon: Tag,
      keywords: 'offer offers discount coupon points partner',
    },
    {
      label: 'Support',
      meta: 'info@potential.com',
      href: learner ? '/dashboard/support' : 'mailto:info@potential.com',
      icon: CircleHelp,
      keywords: 'support help contact email question problem',
    },
  ]
  if (user) {
    list.unshift({ label: 'Dashboard', meta: 'Your home', href: home, icon: LayoutDashboard, keywords: 'dashboard home progress' })
  }
  return list
}

export default function NotFound() {
  const narrow = useNarrow()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [query, setQuery] = useState('')
  const [noMatch, setNoMatch] = useState(false)

  useEffect(() => setUser(getUser()), [])

  const all = useMemo(() => destinationsFor(user), [user])
  const q = query.trim().toLowerCase()
  const shown = q
    ? all.filter((d) => `${d.label} ${d.meta} ${d.keywords}`.toLowerCase().includes(q) || q.split(/\s+/).some((w) => w.length > 2 && d.keywords.includes(w)))
    : all

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!q) return
    const first = shown[0]
    if (!first) {
      if (user?.role === 'sme') router.push(`/dashboard/courses?q=${encodeURIComponent(query.trim())}`)
      else setNoMatch(true)
      return
    }
    if (first.href.startsWith('mailto:')) window.location.href = first.href
    else router.push(first.href)
  }

  const homeHref = user ? all[0].href : '/'

  return (
    <div className="flex min-h-dvh flex-col bg-ui-bg text-ui-text">
      <header className="border-b border-ui-line bg-ui-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-2.5 px-4 min-[900px]:px-10">
          <Link href="/" aria-label="AI Amplify home" className="inline-flex rounded-md">
            <img src="/images/redesign/potential-logo.png" alt="AI Amplify" className="h-9 w-auto" />
          </Link>
          <span className="flex-1" />
          {user ? (
            <Link href={homeHref} className={cn(btn(), 'h-9')}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={cn(btn({ variant: 'secondary' }), 'h-9')}>
                Sign in
              </Link>
              <Link href="/sign-up" className={cn(btn(), 'h-9 max-[420px]:hidden')}>
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <main
        aria-labelledby="h-404"
        className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 items-center gap-6 px-4 py-10 min-[900px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] min-[900px]:gap-14 min-[900px]:px-10 min-[900px]:py-[72px]"
      >
        <div className="flex flex-col gap-[18px]">
          <span aria-hidden className="text-[72px] font-bold leading-none tracking-[-0.05em] text-ui-brand-text tabular-nums min-[900px]:text-[96px]">
            404
          </span>
          <h1 id="h-404" className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] min-[900px]:text-[34px]">
            We can&apos;t find that page
          </h1>
          <p className="max-w-[480px] text-base leading-[1.6] text-ui-muted">
            The link may be broken, or the page may have moved. Your courses, progress and points are safe.
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            <Link href={homeHref} className={btn()}>
              <Home className="h-[18px] w-[18px]" aria-hidden />
              {user ? 'Back to dashboard' : 'Back home'}
            </Link>
            <Link href={all.find((d) => d.label === 'Courses')!.href} className={btn({ variant: 'secondary' })}>
              <GraduationCap className="h-[18px] w-[18px]" aria-hidden />
              Browse courses
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui">
          <div className="flex items-start gap-3">
            <img src="/images/redesign/anna-avatar-96.png" alt="Anna" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" />
            <p className="rounded-[4px_16px_16px_16px] bg-ui-surface-2 px-3.5 py-[11px] text-[15px] leading-[1.55]">
              That page isn&apos;t here. Tell me what you were looking for, or jump to one of these.
            </p>
          </div>
          <form
            role="search"
            onSubmit={onSubmit}
            className="flex items-center gap-2 rounded-[10px] border border-ui-line py-1.5 pl-3 pr-1.5 focus-within:border-ui-brand focus-within:ring-[3px] focus-within:ring-ui-brand-soft"
          >
            <Search className="h-[18px] w-[18px] shrink-0 text-ui-muted" aria-hidden />
            <label htmlFor="nf-q" className="sr-only">
              Search AI Amplify
            </label>
            <input
              id="nf-q"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setNoMatch(false)
              }}
              placeholder={narrow ? 'Search AI Amplify' : 'Search courses, mentors, events'}
              aria-controls="nf-links"
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ui-text outline-none placeholder:text-ui-muted"
            />
            <button type="submit" className={cn(btn(), 'h-[34px]')}>
              Search
            </button>
          </form>
          {shown.length === 0 || noMatch ? (
            <p role="status" className="rounded-[10px] border border-ui-line px-3.5 py-3 text-sm text-ui-muted">
              Nothing matches &ldquo;{query.trim()}&rdquo;. Try courses, mentors, events, offers or support.
            </p>
          ) : (
            <ul id="nf-links" className="overflow-hidden rounded-[10px] border border-ui-line">
              {shown.map((d, i) => {
                const Icon = d.icon
                const inner = (
                  <>
                    <Icon className="h-[18px] w-[18px] shrink-0 text-ui-muted" aria-hidden />
                    <span className="flex-1 font-medium">{d.label}</span>
                    <span className="text-[13px] text-ui-muted max-[420px]:hidden">{d.meta}</span>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-ui-muted" aria-hidden />
                  </>
                )
                const cls = 'flex items-center gap-3 px-3.5 py-3 text-sm text-ui-text transition-colors hover:bg-ui-bg'
                return (
                  <li key={d.label} className={cn(i > 0 && 'border-t border-ui-line')}>
                    {d.href.startsWith('mailto:') ? (
                      <a href={d.href} className={cls}>
                        {inner}
                      </a>
                    ) : (
                      <Link href={d.href} className={cls}>
                        {inner}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
