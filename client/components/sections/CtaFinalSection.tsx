'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Sparkles } from 'lucide-react'
import { CTA_FINAL, REDESIGN_ASSETS } from '@/lib/constants'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { useReducedMotion } from '@/hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export function CtaFinalSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = contentRef.current
    const section = sectionRef.current
    if (!el || !section || reduced) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el.children,
        { opacity: 0, y: 36 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: section, start: 'top 80%', toggleActions: 'play none none none' },
        },
      )
    }, section)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={sectionRef} className="relative py-16 overflow-hidden">
      {/* Full-bleed AI background image */}
      <div className="absolute inset-0">
        <img
          src={REDESIGN_ASSETS.ctaFinalBg.src}
          alt={REDESIGN_ASSETS.ctaFinalBg.alt}
          aria-hidden
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Readability overlays */}
        <div className="absolute inset-0 bg-brand-dark/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/70 via-brand-dark/25 to-brand-dark/40" />
      </div>
      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />

      <div className="absolute -bottom-40 -right-40 w-[640px] h-[640px] rounded-full bg-brand-primary/30 blur-3xl" />
      <div className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-brand-violet/40 blur-3xl" />

      <div ref={contentRef} className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-white/80 text-xs font-medium mb-5">
          <Sparkles className="w-3.5 h-3.5 text-brand-primary-light" />
          Seats are limited
        </span>
        <h2 className="font-bold text-white leading-[1.15] tracking-tight [hyphens:none] text-balance text-[clamp(1.25rem,3.5vw,2.25rem)] drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)]">
          {CTA_FINAL.heading}
        </h2>
        <p className="text-white/70 text-sm sm:text-base max-w-xl mx-auto mt-4 leading-relaxed">
          {CTA_FINAL.subtext}
        </p>
        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <MagneticButton href={CTA_FINAL.loginHref} variant="ghost" size="lg" className="px-8 py-3 text-sm">
            {CTA_FINAL.loginLabel}
          </MagneticButton>
        </div>
      </div>
    </section>
  )
}
