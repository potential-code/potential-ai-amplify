'use client'

import { motion } from 'framer-motion'
import { Quote, Star } from 'lucide-react'
import { TESTIMONIALS } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative py-28 bg-white overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge="What People Say"
          heading="Loved by SMEs and professionals worldwide"
          subtext="Real results from people using AI Amplify's tools every day."
        />

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -8 }}
              className="group rounded-3xl bg-brand-surface border border-brand-surface-2 shadow-sm hover:bg-white hover:border-brand-primary/30 hover:shadow-[0_20px_50px_-20px_rgba(101,45,144,0.35)] transition-all duration-300 p-7 flex flex-col"
            >
              <Quote className="w-7 h-7 text-brand-primary/30 mb-4 group-hover:text-brand-primary/60 group-hover:scale-110 transition-all duration-300" />
              <div className="flex items-center gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, starIdx) => (
                  <motion.span
                    key={starIdx}
                    whileHover={{ scale: 1.2 }}
                    className="inline-flex"
                  >
                    <Star className="w-4 h-4 text-brand-primary fill-brand-primary" />
                  </motion.span>
                ))}
              </div>
              <p className="text-sm text-brand-text-muted leading-relaxed flex-1">
                {t.quote}
              </p>
              <div className="mt-6 pt-5 border-t border-brand-surface-2">
                <p className="text-sm font-bold text-brand-text-primary">{t.name}</p>
                <p className="text-xs text-brand-text-muted mt-0.5">{t.role}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
