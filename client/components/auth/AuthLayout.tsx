'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface AuthLayoutProps {
  badge?: string
  heading: ReactNode
  subheading: string
  altPrompt?: { text: string; ctaLabel: string; ctaHref: string }
  children: ReactNode
}

const BRAND_PANEL_BULLETS = [
  '24/7 AI mentors trained for SMEs',
  'Live events with global industry experts',
  'Private 1:1 sessions with verified human experts',
  'Practical, bite-sized AI training courses',
  'Exclusive partner offers & discounts',
  'No credit card. No catch.',
]

export function AuthLayout({
  badge,
  heading,
  subheading,
  altPrompt,
  children,
}: AuthLayoutProps) {
  const reduced = useReducedMotion()

  return (
    <div className="min-h-screen bg-mesh-dark text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />

      <div className="relative z-10 grid lg:grid-cols-2 min-h-screen">
        {/* Brand panel */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 xl:p-16 border-r border-white/10">
          <div className="absolute inset-0">
            <img
              src={REDESIGN_ASSETS.authVisual.src}
              alt={REDESIGN_ASSETS.authVisual.alt}
              aria-hidden
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/90 via-brand-dark/55 to-brand-dark/40" />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-dark/70 via-brand-dark/20 to-transparent" />
          </div>
          <motion.div
            aria-hidden
            className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-brand-primary/25 blur-3xl"
            animate={
              reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.35, 0.6, 0.35] }
            }
            transition={{ duration: 9, repeat: Infinity }}
          />
          <motion.div
            aria-hidden
            className="absolute -bottom-32 -right-20 w-[460px] h-[460px] rounded-full bg-brand-violet/30 blur-3xl"
            animate={
              reduced ? undefined : { scale: [1.1, 1, 1.1], opacity: [0.3, 0.5, 0.3] }
            }
            transition={{ duration: 11, repeat: Infinity }}
          />

          <div className="relative z-10">
            <Link href="/" className="inline-block mb-10">
              <img
                src={REDESIGN_ASSETS.logo.src}
                alt={REDESIGN_ASSETS.logo.alt}
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>
            {badge && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-white/80 text-xs font-medium mb-5">
                {badge}
              </span>
            )}
            <h2 className="text-display text-balance text-4xl xl:text-5xl font-bold leading-[1.05] mt-2 max-w-md">
              Empower your business with{' '}
              <span className="text-gradient-brand">AI.</span>
            </h2>

            <ul className="mt-8 space-y-2.5 text-sm text-white/70">
              {BRAND_PANEL_BULLETS.map((line) => (
                <li key={line} className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary-light" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

        </aside>

        {/* Form panel */}
        <main className="relative flex items-center justify-center px-4 sm:px-8 py-12 lg:py-16 bg-white text-brand-text-primary">
          <Link href="/" className="lg:hidden absolute top-6 left-6">
            <img
              src={REDESIGN_ASSETS.logo.src}
              alt={REDESIGN_ASSETS.logo.alt}
              className="h-9 w-auto"
            />
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            <div className="text-center lg:text-left mb-7">
              <h1 className="text-display text-balance text-3xl sm:text-4xl font-bold leading-tight text-brand-text-primary">
                {heading}
              </h1>
              <p className="text-brand-text-secondary text-sm mt-2.5">{subheading}</p>
            </div>

            {children}

            {altPrompt && (
              <p className="text-center lg:text-left text-sm text-brand-text-secondary mt-6">
                {altPrompt.text}{' '}
                <Link
                  href={altPrompt.ctaHref}
                  className="text-brand-primary hover:text-brand-primary-dark font-semibold transition-colors"
                >
                  {altPrompt.ctaLabel}
                </Link>
              </p>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
