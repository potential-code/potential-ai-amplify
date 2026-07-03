'use client'

import { motion } from 'framer-motion'
import { Sparkles, Send, FileText, Lightbulb, Zap, Megaphone } from 'lucide-react'
import { CHATBOT, REDESIGN_ASSETS } from '@/lib/constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const CAPABILITY_ICONS = [FileText, Lightbulb, Zap, Megaphone]

export function ChatbotSection() {
  const reduced = useReducedMotion()
  return (
    <section id="ai-assistant" className="relative py-14 bg-mesh-dark overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-brand-primary-light text-[10px] font-semibold uppercase tracking-[0.16em] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {CHATBOT.badge}
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
            Anna – Your AI Business Assistant
          </h2>
          <p className="mt-2.5 text-xs sm:text-sm text-white/70 leading-relaxed">{CHATBOT.subtext}</p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6 max-w-xl mx-auto"
          >
            {CHATBOT.capabilities.map((cap, i) => {
              const Icon = CAPABILITY_ICONS[i % CAPABILITY_ICONS.length]
              return (
                <div
                  key={cap}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl px-2.5 py-3.5 text-center bg-brand-primary/10 border border-brand-primary/25 shadow-sm"
                >
                  <Icon className="w-3.5 h-3.5 text-brand-primary-light" />
                  <span className="text-[11px] font-semibold text-white leading-snug">{cap}</span>
                </div>
              )
            })}
          </motion.div>
        </div>

        {/* Chat preview */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
          className="relative max-w-2xl mx-auto"
        >
          {/* Orb */}
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10">
            <motion.div
              animate={reduced ? undefined : { y: [-4, 4, -4] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-brand-deep shadow-xl"
            >
              <img src={REDESIGN_ASSETS.annaAvatar96.src} alt={REDESIGN_ASSETS.annaAvatar96.alt} className="w-full h-full object-cover" />
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full"
                animate={reduced ? undefined : { boxShadow: ['0 0 0 0 rgba(158,119,255,0.5)', '0 0 0 16px rgba(158,119,255,0)'] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
            </motion.div>
          </div>

          <div className="relative pt-12 rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 backdrop-blur-xl p-4 sm:p-6 shadow-2xl">
            {/* Conversation */}
            <div className="space-y-2.5 mb-5">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex justify-end"
              >
                <div className="max-w-xs bg-brand-primary text-white rounded-xl rounded-tr-sm px-3 py-2 text-[13px] shadow-lg">
                  Create a marketing plan for my new D2C coffee brand in Lagos.
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 }}
                className="flex items-end gap-2"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-white/20">
                  <img src={REDESIGN_ASSETS.annaAvatar96.src} alt={REDESIGN_ASSETS.annaAvatar96.alt} className="w-full h-full object-cover" />
                </div>
                <div className="max-w-xs bg-white/10 border border-white/10 text-white/90 rounded-xl rounded-bl-sm px-3 py-2 text-[13px] backdrop-blur-md">
                  Drafting your plan now — I'll cover positioning, channels, KPIs, and a 90-day rollout.
                  <motion.span
                    animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="inline-flex gap-1 ml-2 align-middle"
                  >
                    <span className="w-1 h-1 rounded-full bg-white" />
                    <span className="w-1 h-1 rounded-full bg-white" />
                    <span className="w-1 h-1 rounded-full bg-white" />
                  </motion.span>
                </div>
              </motion.div>
            </div>

            {/* Input */}
            <div className="flex items-center gap-1.5 rounded-xl bg-black/30 border border-white/10 p-1.5 pl-3">
              <Sparkles className="w-3.5 h-3.5 text-brand-primary-light flex-shrink-0" />
              <p className="text-xs text-white/40 flex-1 truncate">{CHATBOT.placeholder}</p>
              <button
                aria-label="Send"
                className="w-8 h-8 rounded-lg bg-brand-primary hover:bg-brand-primary-dark text-white flex items-center justify-center transition-colors shadow-lg flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-white/40 mt-2.5 text-center">
              Preview only — connect an AI provider to enable live chat.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
