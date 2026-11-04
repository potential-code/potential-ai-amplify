import type { ReactNode } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { LEGAL_LINKS } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

/**
 * Public auth screens (sign in, sign up, mentor setup): a white form pane on
 * the left and a dark AI Amplify panel on the right (hidden below 900px).
 */
export function AuthSplit({
  topPrompt,
  aside,
  asideLabel,
  asideLabelledBy,
  children,
  width = 400,
}: {
  topPrompt: { text: string; ctaLabel: string; ctaHref: string }
  aside: ReactNode
  asideLabel?: string
  asideLabelledBy?: string
  children: ReactNode
  width?: number
}) {
  const year = new Date().getFullYear()
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-ui-surface text-ui-text min-[900px]:grid-cols-2">
      <div className="flex min-w-0 flex-col bg-ui-surface px-4 pb-8 pt-4 min-[900px]:px-12 min-[900px]:py-6">
        <div className="flex h-11 items-center gap-3">
          <Link href="/" aria-label="AI Amplify home" className="inline-flex rounded-md">
            <img src="/images/redesign/potential-logo.png" alt="AI Amplify" className="h-9 w-auto" />
          </Link>
          <span className="flex-1" />
          <span className="text-right text-sm text-ui-muted">
            <span className="max-[420px]:hidden">{topPrompt.text} </span>
            <Link href={topPrompt.ctaHref} className="font-semibold text-ui-brand-text hover:underline">
              {topPrompt.ctaLabel}
            </Link>
          </span>
        </div>

        <main className="flex flex-1 items-center justify-center py-8 min-[900px]:py-10">
          <div className="flex w-full flex-col gap-6" style={{ maxWidth: width }}>
            {children}
          </div>
        </main>

        <div className="flex flex-wrap gap-4 text-[13px] text-ui-muted">
          <span>Potential © 2005-{year}</span>
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="hover:text-ui-text">
            Privacy Policy
          </a>
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="hover:text-ui-text">
            Terms of Use
          </a>
        </div>
      </div>

      <aside
        aria-label={asideLabel}
        aria-labelledby={asideLabelledBy}
        className="relative m-3 hidden flex-col gap-7 overflow-hidden rounded-[14px] bg-[#1c1029] p-11 text-white min-[900px]:flex"
      >
        {aside}
      </aside>
    </div>
  )
}

/** Page title block above an auth form. */
export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
        {title}
      </h1>
      {subtitle && <p className="text-[15px] text-ui-muted">{subtitle}</p>}
    </div>
  )
}

/** Muted copy on the dark panel. */
export const asideMuted = 'text-white/[0.74]'

export function AsideChecklist({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-3 text-[15px]', className)}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2.5">
          <Check className="h-[18px] w-[18px] shrink-0 text-[#cfadf0]" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}

/** Anna speech bubble on the dark panel. */
export function AsideSana({ children, size = 48 }: { children: ReactNode; size?: number }) {
  return (
    <div className="flex items-start gap-3">
      <img
        src="/images/redesign/anna-avatar-96.png"
        alt="Anna"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover object-top shadow-[0_0_0_3px_rgba(207,173,240,.35)]"
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Anna</span>
        <p className="rounded-[4px_16px_16px_16px] border border-white/[0.12] bg-white/[0.08] px-3.5 py-3 text-[15px] leading-[1.55]">
          {children}
        </p>
      </div>
    </div>
  )
}

export function AsideStats() {
  const stats = [
    { v: '6', l: 'core AI courses' },
    { v: '6', l: 'AI mentors' },
    { v: '24/7', l: 'with Anna' },
  ]
  return (
    <dl className="mt-2 flex gap-7 border-t border-white/[0.14] pt-[18px]">
      {stats.map((s) => (
        <div key={s.l} className="flex flex-col-reverse gap-0.5">
          <dt className={cn('text-[13px]', asideMuted)}>{s.l}</dt>
          <dd className="text-xl font-bold">{s.v}</dd>
        </div>
      ))}
    </dl>
  )
}
