'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'

/** In-page anchors. `wide` items hide between 900px and 1100px to keep one row. */
export const LANDING_NAV = [
  { label: 'About', href: '#about' },
  { label: 'Courses', href: '#courses' },
  { label: 'Mentors', href: '#ai-mentors' },
  { label: 'Anna', href: '#ai-assistant' },
  { label: 'Events', href: '#events', wide: true },
  { label: 'Offers', href: '#offers', wide: true },
  { label: 'Stakeholders', href: '#stakeholder' },
  { label: 'Community', href: '#community', wide: true },
] as const

const MOBILE_EXTRA = [{ label: 'Human mentors', href: '#mentors' }]

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    function onResize() {
      if (window.innerWidth >= 900) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const mobileLinks = [
    ...LANDING_NAV.slice(0, 2),
    { label: 'AI mentors', href: '#ai-mentors' },
    ...MOBILE_EXTRA,
    ...LANDING_NAV.slice(3),
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-ui-line bg-ui-surface">
      <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center gap-4 px-4 min-[900px]:px-10">
        <Link href="/" aria-label="AI Amplify home" className="inline-flex items-center rounded-md">
          <img src="/images/redesign/potential-logo.png" alt="AI Amplify" className="h-10 w-auto" />
        </Link>

        <nav aria-label="Main" className="ml-5 hidden flex-1 items-center gap-0.5 min-[900px]:flex">
          {LANDING_NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-lg px-2.5 py-2 text-sm font-medium text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text',
                'wide' in l && l.wide && 'max-[1100px]:hidden',
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <span className="flex-1 min-[900px]:hidden" />

        <Link href="/login" className={cn(btn({ variant: 'secondary' }), 'h-[38px] max-[899px]:hidden')}>
          Sign in
        </Link>
        <Link href="/sign-up" className={cn(btn({ variant: 'primary' }), 'h-[38px]')}>
          Sign up
        </Link>
        <button
          ref={toggleRef}
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className={cn(btn({ variant: 'secondary', size: 'icon' }), 'h-[38px] w-[38px] min-[900px]:hidden')}
        >
          {open ? <X className="h-[18px] w-[18px]" aria-hidden /> : <Menu className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      </div>

      {open && (
        <div
          id="landing-mobile-menu"
          ref={panelRef}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-68px)] overflow-y-auto border-b border-ui-line bg-ui-surface shadow-ui min-[900px]:hidden"
        >
          <nav aria-label="Main mobile" className="mx-auto flex max-w-[1200px] flex-col px-4 py-3">
            {mobileLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-[10px] px-3 py-3 text-[15px] font-medium text-ui-text hover:bg-ui-surface-2"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-ui-line pt-3">
              <Link href="/login" className={btn({ variant: 'secondary', size: 'lg' })}>
                Sign in
              </Link>
              <Link href="/sign-up" className={btn({ variant: 'primary', size: 'lg' })}>
                Sign up
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
