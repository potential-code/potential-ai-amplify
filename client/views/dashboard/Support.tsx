'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, HelpCircle, CreditCard, Calendar, Award, Tag } from 'lucide-react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { EmbeddedDashboardAssistant } from '@/components/dashboard/EmbeddedDashboardAssistant'
import { type EmptyStateChip } from '@/components/dashboard/ChatEmptyState'
import { useCopilotTokenReady, getCopilotHeaders } from '@/components/dashboard/copilotConfig'
import { FAQS } from '@/lib/dashboardData'
import { cn } from '@/lib/utils'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent + thread bind on <CopilotChat>/useAgent inside
// EmbeddedDashboardAssistant, not on the provider.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

const SUPPORT_CHIPS: EmptyStateChip[] = [
  { label: 'Pricing & plans', icon: CreditCard, message: 'How much does AI Amplify cost?' },
  { label: 'Book a mentor', icon: Calendar, message: 'How do I book a session with a human mentor?' },
  { label: 'Certificates', icon: Award, message: 'How are certificates issued?' },
  { label: 'Partner offers', icon: Tag, message: 'Can I redeem multiple partner offers?' },
]

export default function SupportPage() {
  const [open, setOpen] = useState<number | null>(0)
  // Assistant is for logged-in users only: wait for the minted service token
  // before mounting the CopilotKit provider (its first request needs auth).
  const copilotReady = useCopilotTokenReady()
  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Support"
        title="How can we"
        highlight="help?"
        subtitle="Search the knowledge base, message us, or chat with the AI Amplify assistant."
      />

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        <div className="col-span-12 lg:col-span-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white border border-brand-surface-2 overflow-hidden"
          >
            <header className="px-6 py-5 border-b border-brand-surface-2 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-bold text-brand-text-primary">Frequently asked</h3>
                <p className="text-xs text-brand-text-muted">Top questions from AI Amplify members.</p>
              </div>
            </header>
            <ul className="divide-y divide-brand-surface-2">
              {FAQS.map((f, i) => {
                const isOpen = i === open
                return (
                  <li key={f.q}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-brand-surface/50 transition-colors"
                    >
                      <span className="flex-1 text-sm font-bold text-brand-text-primary">{f.q}</span>
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-brand-text-muted transition-transform',
                          isOpen && 'rotate-180 text-brand-primary',
                        )}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="px-6 pb-5 text-sm text-brand-text-muted leading-relaxed">
                            {f.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        </div>

        <div className="col-span-12 lg:col-span-6">
          {copilotReady ? (
            <CopilotKit
              runtimeUrl={VOICE_RUNTIME_URL}
              headers={getCopilotHeaders()}
              useSingleEndpoint={false}
              enableInspector={false}
              showDevConsole={false}
            >
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-2xl border border-brand-surface-2 bg-white overflow-hidden"
              >
                <EmbeddedDashboardAssistant
                  className="h-[calc(100vh-14rem)] min-h-[560px]"
                  emptyStateChips={SUPPORT_CHIPS}
                  emptyStateChipsGrid
                  emptyStateShowAiTools={false}
                  emptyStateTagline="Ask me anything about AI Amplify, your account, or your business."
                  emptyStateHint="Choose a question to get started, or type your own."
                />
              </motion.div>
            </CopilotKit>
          ) : (
            <div className="h-[calc(100vh-14rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white shadow-sm animate-pulse" />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
