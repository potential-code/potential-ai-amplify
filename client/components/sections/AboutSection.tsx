'use client'

import { motion } from 'framer-motion'
import {
  Gift,
  Users,
  Clock,
  Sparkles,
  BookOpen,
  Bot,
  UserCheck,
  Percent,
  Briefcase,
  Search,
  BadgeCheck,
  Video,
  Globe,
} from 'lucide-react'
import { ABOUT, REDESIGN_ASSETS } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const ABOUT_GROUPS = [
  { ...ABOUT.outcomes, icon: Gift, itemIcons: [BookOpen, Bot, UserCheck, Percent] },
  { ...ABOUT.audience, icon: Users, itemIcons: [Briefcase, Search, Users, Sparkles] },
  { ...ABOUT.format, icon: Clock, itemIcons: [BadgeCheck, Clock, Video, Globe] },
]

export function AboutSection() {
  const reduced = useReducedMotion()

  return (
    <section id="about" className="relative py-28 bg-mesh-soft overflow-hidden">
      {/* Top-left brand glow orb */}
      <motion.div
        aria-hidden
        className="absolute -top-24 -left-24 w-[480px] h-[480px] rounded-full bg-brand-primary/25 blur-3xl pointer-events-none"
        animate={reduced ? undefined : { scale: [1, 1.12, 1], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute -top-10 -left-10 w-[260px] h-[260px] rounded-full bg-brand-violet/20 blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-stretch">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative order-2 lg:order-1 h-full"
          >
            <div className="relative rounded-3xl overflow-hidden border border-brand-primary/10 shadow-xl h-full min-h-[360px]">
              <img
                src={REDESIGN_ASSETS.aboutPhoto.src}
                alt={REDESIGN_ASSETS.aboutPhoto.alt}
                className="w-full h-full object-cover block"
                loading="lazy"
              />
            </div>
          </motion.div>

          {/* Copy */}
          <div className="order-1 lg:order-2">
            <SectionHeader badge={ABOUT.badge} heading="About" highlight="AI Amplify" align="left" />

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 text-brand-text-muted leading-relaxed max-w-lg"
            >
              {ABOUT.body}
            </motion.p>

            {/* What you'll get / Who it's for / Format — glass cards */}
            <div className="mt-10 grid grid-cols-3 gap-3">
              {ABOUT_GROUPS.map((group, i) => (
                <motion.div
                  key={group.heading}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -5 }}
                  className="group relative rounded-2xl bg-white/50 backdrop-blur-xl border border-white/60 shadow-[0_10px_36px_rgba(101,45,144,0.22)] hover:shadow-[0_16px_48px_rgba(101,45,144,0.35)] hover:bg-white/65 transition-all duration-300 p-4"
                >
                  <h3 className="text-brand-text-primary text-sm font-bold mb-3">{group.heading}</h3>

                  <div className="flex flex-col gap-2">
                    {group.items.map((item, idx) => {
                      const ItemIcon = group.itemIcons[idx]
                      return (
                        <div key={item} className="flex items-center gap-1.5 text-[11px] text-brand-text-primary/85">
                          <ItemIcon className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                          <span className="leading-snug">{item}</span>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
