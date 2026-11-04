'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { btn } from '@/components/kit'
import { STAKEHOLDER, type StakeholderKind } from '@/lib/constants/content'
import { StakeholderRegisterDialog } from '@/components/landing/StakeholderRegisterDialog'

const ART: Record<StakeholderKind, string> = {
  expert: '/images/redesign/stakeholder-1-experts.png',
  vc: '/images/redesign/stakeholder-2-vc.png',
  government: '/images/redesign/stakeholder-3-government.png',
  corporate: '/images/redesign/stakeholder-4-corporate.png',
  university: '/images/redesign/stakeholder-5-university.png',
  incubator: '/images/redesign/stakeholder-6-incubator.png',
}

/** Strip the old exclamation marks and commas-before-or so the copy reads calmly. */
const calm = (s: string) => s.replace(/!$/, '.').replace(/, or /g, ' or ').replace(/, and /g, ' and ')

export function LandingStakeholders() {
  const [kind, setKind] = useState<StakeholderKind | null>(null)

  return (
    <section
      id="stakeholder"
      aria-labelledby="h-stake"
      className="scroll-mt-[68px] border-y border-ui-line bg-ui-surface py-9"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-[1_1_520px] flex-col gap-2">
            <h2 id="h-stake" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
              Become a program stakeholder
            </h2>
            <p className="text-base leading-[1.55] text-ui-muted">
              Do you represent a startup or SME? Register here. Otherwise, choose the option that best suits your
              engagement.
            </p>
          </div>
          <Link href={STAKEHOLDER.smeCtaHref} className={btn()}>
            {STAKEHOLDER.smeCtaLabel}
          </Link>
        </div>
        <ul aria-label="Stakeholder programs" className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 min-[1101px]:grid-cols-3">
          {STAKEHOLDER.cards.map((c) => (
            <li key={c.kind}>
              <button
                type="button"
                onClick={() => setKind(c.kind as StakeholderKind)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-start transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-ui"
              >
                <span className="block aspect-[16/9] overflow-hidden bg-[#F4ECFE]">
                  <img
                    src={ART[c.kind as StakeholderKind]}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                </span>
                <span className="flex flex-1 flex-col gap-1 px-[18px] py-3.5">
                  <span className="text-[15px] font-semibold text-ui-text">{c.title}</span>
                  <span className="line-clamp-2 text-sm leading-normal text-ui-muted">{calm(c.description)}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-[13px] font-semibold text-ui-brand-text">
                    {c.ctaLabel}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <StakeholderRegisterDialog kind={kind} open={kind !== null} onClose={() => setKind(null)} />
    </section>
  )
}
