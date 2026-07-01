'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Sparkles } from 'lucide-react'

const STEPS = [
  'Analyzing your profile & goals',
  'Mapping your skill gaps',
  'Curating the best content',
  'Building your milestones',
  'Personalizing your path',
]

interface LearningPathGeneratingLoaderProps {
  complete?: boolean
}

// ── Step indicator icons ───────────────────────────────────────────────────────

function CompletedIcon() {
  return (
    <span
      className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
      style={{ background: '#9f2063' }}
    >
      <CheckCircle2 size={15} strokeWidth={2.5} className="text-white" />
    </span>
  )
}

function ActiveIcon({ reduced }: { reduced: boolean }) {
  return (
    <span className="relative flex items-center justify-center w-7 h-7 flex-shrink-0">
      {/* Pulsing outer ring */}
      {!reduced && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: 'rgba(159,32,99,0.25)' }}
        />
      )}
      {/* Inner filled circle with spinner dots */}
      <span
        className="relative flex items-center justify-center w-7 h-7 rounded-full border-2"
        style={{ borderColor: '#9f2063', background: 'rgba(159,32,99,0.08)' }}
      >
        <span className="flex gap-0.5 items-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full"
              style={{
                background: '#9f2063',
                animation: reduced
                  ? 'none'
                  : `bounceDot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </span>
      </span>
    </span>
  )
}

function UpcomingIcon() {
  return (
    <span
      className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border-2"
      style={{ borderColor: '#f7e8f0', background: '#fdf5f9' }}
    >
      <span className="w-2 h-2 rounded-full bg-[#d4b8c8]" />
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LearningPathGeneratingLoader({ complete }: LearningPathGeneratingLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const shouldReduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    if (complete) {
      setCurrentStep(STEPS.length)
      return
    }
    if (currentStep >= STEPS.length - 1) return
    const timer = setTimeout(() => setCurrentStep((s) => s + 1), 3000)
    return () => clearTimeout(timer)
  }, [currentStep, complete])

  return (
    <>
      {/* Keyframe for bouncing dots — injected inline to avoid CSS module dependency */}
      <style>{`
        @keyframes bounceDot {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center px-6 py-10 max-w-sm mx-auto w-full"
      >
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-3 mb-8 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
        >
          <span
            className="flex items-center justify-center w-12 h-12 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #fdf5f9 0%, #f7e8f0 100%)', border: '1.5px solid #f0d5e5' }}
          >
            <Sparkles size={22} style={{ color: '#9f2063' }} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-brand-text-primary leading-snug">
              Generating your learning path…
            </p>
            <p className="mt-1 text-[12px] text-brand-text-muted">
              This takes about 30 seconds
            </p>
          </div>
        </motion.div>

        {/* Steps list */}
        <ol className="w-full space-y-3">
          {STEPS.map((label, index) => {
            const isCompleted = index < currentStep
            const isActive = index === currentStep && !complete
            const isDone = complete || currentStep === STEPS.length

            return (
              <motion.li
                key={label}
                layout={!shouldReduceMotion}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06, duration: 0.3 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isCompleted || isDone ? (
                    <motion.span
                      key="completed"
                      initial={{ scale: shouldReduceMotion ? 1 : 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    >
                      <CompletedIcon />
                    </motion.span>
                  ) : isActive ? (
                    <motion.span
                      key="active"
                      initial={{ scale: shouldReduceMotion ? 1 : 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ActiveIcon reduced={shouldReduceMotion} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="upcoming"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <UpcomingIcon />
                    </motion.span>
                  )}
                </AnimatePresence>

                <span
                  className="text-[13px] leading-snug transition-colors duration-300"
                  style={{
                    color: isCompleted || isDone
                      ? '#9f2063'
                      : isActive
                      ? '#1A0A12'
                      : '#9B8E94',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {label}
                </span>

                {/* Subtle checkmark text complement */}
                {(isCompleted || isDone) && (
                  <motion.span
                    className="ml-auto text-[11px] font-medium"
                    style={{ color: '#9f2063' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    Done
                  </motion.span>
                )}
              </motion.li>
            )
          })}
        </ol>

        {/* Bottom shimmer bar */}
        <motion.div
          className="mt-8 w-full h-1 rounded-full overflow-hidden"
          style={{ background: '#f7e8f0' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #9f2063 0%, #c42b7a 50%, #9f2063 100%)' }}
            animate={
              complete
                ? { width: '100%' }
                : { width: `${Math.round(((currentStep + 1) / STEPS.length) * 100)}%` }
            }
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />
        </motion.div>
      </motion.div>
    </>
  )
}
