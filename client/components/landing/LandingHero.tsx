import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { btn } from '@/components/kit'
import { HERO, PROGRAM_FACTS, REDESIGN_ASSETS } from '@/lib/constants/content'
import { cn } from '@/lib/utils'

const STATS = PROGRAM_FACTS

const INCLUDED = [
  'Six core AI courses with certificates',
  'AI mentors and Anna, 24/7',
  'Private 1:1 human mentor sessions',
  'Live events and recordings',
]

/** Hero with the About copy folded in, plus the Anna registration entry. */
export function LandingHero() {
  return (
    <section id="about" aria-labelledby="h-hero" className="scroll-mt-[68px] pb-[52px] pt-8">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-y-6 px-4 min-[900px]:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] min-[900px]:gap-12 min-[900px]:px-10">
        <div className="flex flex-col gap-5">
          <h1
            id="h-hero"
            className="text-balance text-[34px] font-semibold leading-[1.06] tracking-[-0.035em] text-ui-text min-[900px]:text-[48px]"
          >
            {HERO.headline}
          </h1>
          <p className="max-w-[640px] text-[17px] leading-[1.55] text-ui-muted">
            AI Amplify is a program for small and medium businesses, by Potential. Learn the core AI skills, get
            guidance from AI and human mentors, join live events, and put AI tools to work in your business.
          </p>
          <ul className="grid grid-cols-1 gap-2 text-[15px] text-ui-text sm:grid-cols-2">
            {INCLUDED.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-[18px] w-[18px] shrink-0 text-ui-brand-text" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-wrap gap-3">
            <Link href={HERO.ctaHref} className={cn(btn({ size: 'lg' }), 'h-[46px] max-[520px]:flex-1')}>
              Get started
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
            </Link>
            <Link
              href={HERO.loginHref}
              className={cn(btn({ variant: 'secondary', size: 'lg' }), 'h-[46px] max-[520px]:flex-1')}
            >
              Sign in
            </Link>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-y-4 border-t border-ui-line pt-5 min-[900px]:flex min-[900px]:gap-0">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  'flex flex-col-reverse gap-0.5',
                  i > 0 && 'min-[900px]:ml-7 min-[900px]:border-l min-[900px]:border-ui-line min-[900px]:pl-7',
                )}
              >
                <dt className="text-[13px] text-ui-muted">{s.label}</dt>
                <dd className="text-2xl font-bold tracking-[-0.02em] text-ui-text tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <img
            src={REDESIGN_ASSETS.hero.src}
            alt="A business owner working with AI tools at her desk"
            fetchPriority="high"
            className="block h-[300px] w-full rounded-[14px] object-cover object-[66%_center] min-[900px]:h-[460px]"
          />
          <SanaEntryCard />
        </div>
      </div>
    </section>
  )
}

/**
 * Anna's front door. Registering opens Anna's sign-up chat on the sign-up page
 * (she asks for the invite code); logging in goes to /login.
 */
function SanaEntryCard() {
  return (
    <aside
      aria-labelledby="h-sana"
      className="relative mx-3 -mt-12 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-[0_2px_4px_rgba(23,23,28,.06),0_18px_48px_rgba(23,23,28,.16)] min-[900px]:absolute min-[900px]:-bottom-9 min-[900px]:-left-10 min-[900px]:m-0 min-[900px]:w-[310px]"
    >
      <div className="flex items-center gap-2.5 border-b border-ui-line px-3.5 py-3">
        <img src="/images/redesign/anna-avatar-96.png" alt="" className="h-9 w-9 rounded-full object-cover object-top" />
        <div className="flex flex-col">
          <h2 id="h-sana" className="text-sm font-semibold text-ui-text">
            Anna
          </h2>
          <span className="text-xs text-ui-muted">Here to get you started</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        <p className="rounded-[4px_14px_14px_14px] bg-ui-surface-2 px-3 py-2.5 text-sm leading-normal text-ui-text">
          Hi! I&apos;m Anna. Have an invite? Register here, or log in to your account.
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/sign-up?with=sana" className={btn()}>
            I want to register
          </Link>
          <Link href="/login" className={btn({ variant: 'secondary' })}>
            I want to log in
          </Link>
        </div>
      </div>
    </aside>
  )
}
