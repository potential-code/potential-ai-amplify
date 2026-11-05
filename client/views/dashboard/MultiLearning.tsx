'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { SanaTutor } from '@/components/tutor/SanaTutor'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'
import { getUser } from '@/lib/auth'
import type { LearnerLanguage } from '@/components/tutor/api'

const LANG_KEY = 'tutor.lang'

function savedLang(): LearnerLanguage {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'ar' || v === 'hi' || v === 'ur' ? v : 'en'
  } catch {
    return 'en'
  }
}

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent + thread bind on <CopilotChat>/useAgent inside
// SanaTutor, not on the provider.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

/**
 * Multi Learning — Anna as the tutor, teaching AI Amplify courses in conversation.
 * Full-bleed Anna Studio canvas, same provider pattern as the examiner.
 */
export default function MultiLearningPage({ standalone = false }: { standalone?: boolean } = {}) {
  // The app view (/dashboard/multi-learning/app) is the tutor alone, the way it
  // runs on a phone: no sidebar, header or bottom bar around it.
  const Shell = standalone ? StandaloneShell : DashboardShell
  const copilotReady = useCopilotTokenReady()
  const [user, setUser] = useState(() => getUser())
  useEffect(() => setUser(getUser()), [])
  const [lang, setLang] = useState<LearnerLanguage>(() => savedLang())
  const onLanguageChange = useCallback((next: LearnerLanguage) => {
    setLang(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* private mode: the language simply isn't remembered */
    }
  }, [])

  if (!copilotReady) {
    return (
      <Shell>
        <div className="flex-1 min-h-0 bg-ui-bg" aria-busy="true" />
      </Shell>
    )
  }

  const firstName = (user?.fullName ?? '').split(' ')[0] || 'there'
  const userKey = user?.id ?? 'anon'

  return (
    <CopilotKit
      /* A new language is a new conversation: the tutor restarts in it. */
      key={lang}
      runtimeUrl={VOICE_RUNTIME_URL}
      /* Resolved object, not the function — the core's /info fetch doesn't
         resolve function-form headers. Safe: this subtree only mounts after
         useCopilotTokenReady(), so the token is already cached. */
      headers={getCopilotHeaders()}
      /* Express handler is multi-route, so single-endpoint mode must be off. */
      useSingleEndpoint={false}
      enableInspector={false}
      showDevConsole={false}
    >
      <Shell>
        <SanaTutor firstName={firstName} userKey={userKey} lang={lang} onLanguageChange={onLanguageChange} standalone={standalone} />
      </Shell>
    </CopilotKit>
  )
}

function DashboardShell({ children }: { children: ReactNode }) {
  return <DashboardLayout fullBleed>{children}</DashboardLayout>
}

function StandaloneShell({ children }: { children: ReactNode }) {
  return <div className="flex h-dvh flex-col overflow-hidden bg-ui-bg">{children}</div>
}
