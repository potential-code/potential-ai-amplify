'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, Mail, Search, Sparkles } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, EmptyState, PageHeader, btn, inputClass } from '@/components/kit'
import { FAQS } from '@/lib/dashboardData'
import { LEGAL_LINKS } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'info@potential.com'

/** Visible copy uses full stops instead of dashes ("Yes — joining" -> "Yes. Joining"). */
function plain(text: string) {
  return text.replace(/\s+[—–]\s+(\w)/g, (_, c: string) => `. ${c.toUpperCase()}`)
}

export default function SupportPage() {
  const [open, setOpen] = useState<number | null>(0)
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const faqs = FAQS.map((f, i) => ({ ...f, i })).filter((f) => !query || `${f.q} ${f.a}`.toLowerCase().includes(query))

  return (
    <DashboardLayout>
      <PageHeader title="Support" subtitle="Browse common questions, email our team, or ask Anna." />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card aria-labelledby="s-faq">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-0.5">
              <h2 id="s-faq" className="text-base font-semibold text-ui-text">Frequently asked</h2>
              <span className="text-[13px] text-ui-muted">Top questions from AI Amplify members</span>
            </div>
            <div className="relative w-full sm:w-[260px]">
              <label htmlFor="s-search" className="sr-only">
                Search questions
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" aria-hidden />
              <input
                id="s-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search questions"
                className={cn(inputClass, 'h-[38px] bg-ui-bg pl-9')}
              />
            </div>
          </div>
          {faqs.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No questions match"
              body={`Nothing matches "${q.trim()}". Email us or ask Anna instead.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setQ('')}>
                  Clear search
                </Button>
              }
              className="border-t border-ui-line"
            />
          ) : (
            <ul>
              {faqs.map((f) => {
                const isOpen = query ? true : f.i === open
                return (
                  <li key={f.q} className="border-t border-ui-line">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`faq-${f.i}`}
                        onClick={() => setOpen(f.i === open ? null : f.i)}
                        disabled={!!query}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] font-semibold text-ui-text transition-colors hover:bg-ui-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-brand disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className="flex-1">{f.q}</span>
                        <ChevronDown
                          className={cn('h-[18px] w-[18px] shrink-0 text-ui-muted transition-transform', isOpen && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    </h3>
                    {isOpen && (
                      <p id={`faq-${f.i}`} className="max-w-[680px] px-5 pb-[18px] text-[15px] leading-relaxed text-ui-muted">
                        {plain(f.a)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card aria-labelledby="s-sana" className="flex flex-col gap-3 p-5 shadow-ui">
            <div className="flex items-center gap-3">
              <img
                src="/images/redesign/anna-avatar-96.png"
                alt=""
                className="h-11 w-11 rounded-full object-cover object-top"
              />
              <div className="flex flex-col">
                <h2 id="s-sana" className="text-base font-semibold text-ui-text">Ask Anna</h2>
                <span className="text-[13px] text-ui-muted">Your AI concierge, any time</span>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-ui-muted">Get instant answers about AI Amplify, your account, or your business.</p>
            <Link href="/dashboard/anna" className={btn()}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Ask Anna
            </Link>
          </Card>

          <Card aria-labelledby="s-mail" className="flex flex-col gap-2.5 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ui-surface-2 text-ui-text">
                <Mail className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="flex flex-col">
                <h2 id="s-mail" className="text-base font-semibold text-ui-text">Email support</h2>
                <span className="text-[13px] text-ui-muted">We typically reply within one working day</span>
              </div>
            </div>
            <a href={`mailto:${SUPPORT_EMAIL}`} className={btn({ variant: 'secondary' })}>
              {SUPPORT_EMAIL}
            </a>
          </Card>

          <Card aria-labelledby="s-legal" className="flex flex-col gap-2 px-5 py-4">
            <h2 id="s-legal" className="text-sm font-semibold text-ui-text">Policies</h2>
            {[
              { label: 'Privacy policy', href: LEGAL_LINKS.privacy },
              { label: 'Terms of use', href: LEGAL_LINKS.terms },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded py-1 text-sm text-ui-brand-text hover:underline"
              >
                {l.label}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
            ))}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
