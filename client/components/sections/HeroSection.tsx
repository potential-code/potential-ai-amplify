'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Sparkles, CheckCircle2 } from 'lucide-react'
import { HERO, REDESIGN_ASSETS } from '@/lib/constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { LandingRegistrationChat } from '../landing/LandingRegistrationChat'

const HERO_PILLS = ['AI Mentors', 'Live Events', 'AI Tools', 'Human Mentors']

const HERO_CHECKPOINTS = [
  'AI business coach, available 24/7',
  'Live expert-led sessions',
  'Practical, bite-sized AI courses',
  'Trusted by SMEs in 50+ countries',
]

export function HeroSection() {
  const reduced = useReducedMotion()

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden bg-mesh-dark"
    >
      {/* Full-bleed AI background image */}
      <div className="absolute inset-0">
        <img
          src={REDESIGN_ASSETS.heroBg.src}
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Readability overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-dark/95 via-brand-dark/78 to-brand-dark/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/35 via-transparent to-brand-dark/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_20%_45%,rgba(13,6,20,0.65)_0%,transparent_70%)]" />
      </div>

      {/* Layered glow accents */}
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      <motion.div
        aria-hidden
        className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-brand-primary/25 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 right-0 w-[520px] h-[520px] rounded-full bg-brand-violet/35 blur-3xl"
        animate={reduced ? undefined : { scale: [1.1, 1, 1.1], opacity: [0.35, 0.6, 0.35] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
        {/* Left column — hero content (55%) */}
        <div className="w-full lg:w-[55%] text-center lg:text-left flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-white/80 text-xs font-medium mb-7 self-center lg:self-start"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-primary-light" />
            <span className="tracking-wide uppercase text-[11px]">AI Amplify</span>
            <span className="hidden sm:inline text-white/40">·</span>
            <span className="hidden sm:inline text-white/60">Global program</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-display text-balance text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-white leading-[1.1] drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)]"
          >
            {HERO.headline}
          </motion.h1>

          {/* Feature pills */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-7 flex flex-wrap gap-2 justify-center lg:justify-start"
          >
            {HERO_PILLS.map((pill) => (
              <span
                key={pill}
                className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm text-white/85 text-xs sm:text-[13px] font-semibold"
              >
                {pill}
              </span>
            ))}
          </motion.div>

          {/* Benefit checkpoints */}
          <div className="mt-6 flex flex-col gap-2.5 max-w-lg mx-auto lg:mx-0">
            {HERO_CHECKPOINTS.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.08 }}
                className="flex items-center gap-2.5 text-sm sm:text-[15px] text-white/85 justify-center lg:justify-start"
              >
                <CheckCircle2 className="w-4 h-4 text-brand-primary-light flex-shrink-0" />
                <span>{item}</span>
              </motion.div>
            ))}
          </div>

        </div>

        {/* Right column — registration chatbot (45%) */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full lg:w-[45%] flex-shrink-0 h-[50vh] lg:h-[calc(100vh-10rem)] lg:-mt-4"
        >
          <LandingRegistrationChat />
        </motion.div>
      </div>

      {/* Scroll indicator — centered at bottom */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center text-white/40"
        animate={reduced ? undefined : { y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 1.8 }}
      >
        <span className="text-[10px] tracking-[0.3em] uppercase mb-1">Scroll</span>
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </section>
  )
}
