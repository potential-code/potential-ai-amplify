'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play } from 'lucide-react'
import { JOURNEY_COURSES } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { cn } from '@/lib/utils'

export function CoursesSection() {
  const [active, setActive] = useState(0)
  const course = JOURNEY_COURSES.courses[active]

  return (
    <section id="courses" className="relative py-28 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge={JOURNEY_COURSES.badge}
          heading="The Entrepreneur's"
          highlight="Journey"
          subtext={JOURNEY_COURSES.subtext}
        />

        {/* Journey stepper */}
        <div className="relative mt-16 max-w-5xl mx-auto">
          <div className="absolute top-6 left-[8.33%] right-[8.33%] h-0.5 bg-brand-surface-2 hidden lg:block" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-6 gap-x-2 relative">
            {JOURNEY_COURSES.courses.map((c, i) => {
              const isActive = active === i
              return (
                <button
                  key={c.title}
                  onClick={() => setActive(i)}
                  className="relative flex flex-col items-center gap-3 group"
                >
                  <motion.span
                    animate={{ scale: isActive ? 1.15 : 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={cn(
                      'relative z-10 w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors duration-300',
                      isActive
                        ? 'bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/30'
                        : 'bg-white text-brand-primary border-brand-surface-2 group-hover:border-brand-primary/40',
                    )}
                  >
                    {i + 1}
                  </motion.span>
                  <span
                    className={cn(
                      'text-xs sm:text-[13px] font-semibold text-center leading-snug max-w-[9rem] transition-colors duration-300',
                      isActive ? 'text-brand-primary' : 'text-brand-text-muted group-hover:text-brand-text-primary',
                    )}
                  >
                    {c.title}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected course detail */}
        <div className="max-w-5xl mx-auto mt-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="rounded-3xl border border-brand-surface-2 bg-mesh-soft p-6 sm:p-10"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-brand-text-primary leading-tight">
                  {course.title}
                </h3>
                <span className="flex-shrink-0 text-xs font-semibold text-brand-primary bg-brand-primary/10 rounded-full px-3 py-1.5">
                  {course.units.length} units
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {course.units.map((unit, ui) => (
                  <motion.div
                    key={unit}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * ui }}
                    className="flex items-center gap-3 rounded-xl bg-white border border-brand-surface-2 px-4 py-3"
                  >
                    <div className="w-7 h-7 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                      <Play className="w-2.5 h-2.5 text-brand-primary fill-brand-primary" />
                    </div>
                    <span className="text-sm text-brand-text-primary leading-snug">{unit}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
