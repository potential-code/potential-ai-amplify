'use client'

import { useState, useEffect, useCallback } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { EmbeddedLearningAssistant } from '@/components/dashboard/EmbeddedLearningAssistant'
import { ConversationalQuestionnaire } from '@/components/dashboard/ConversationalQuestionnaire'
import {
  useCopilotTokenReady,
  getCopilotHeaders,
  getLearningThreadId,
  resetLearningThreadId,
} from '@/components/dashboard/copilotConfig'
import {
  fetchLearningPath,
  fetchLearningQuestions,
  apiGenerateLearningPath,
  type ActiveLearningPath,
  type LearningQuestion,
} from '@/lib/api/lms'
import { LearningPathGeneratingLoader } from '@/components/shared/LearningPathGeneratingLoader'

// ── CopilotKit URLs ───────────────────────────────────────────────────────────

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-brand-surface-2 bg-white p-6 space-y-3">
          <div className="h-4 w-1/3 bg-brand-surface-2 rounded" />
          <div className="h-3 w-2/3 bg-brand-surface-2 rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-10 bg-brand-surface rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Inner page (inside CopilotKit) ────────────────────────────────────────────

function LearningPageInner() {
  const [path, setPath] = useState<ActiveLearningPath | null | undefined>(undefined)
  const [questions, setQuestions] = useState<LearningQuestion[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Stable thread ID for this learning surface — held in a module singleton so
  // the chat history survives in-app navigation away and back (same design as the
  // dashboard chat). Reset mints a fresh id, starting a new conversation.
  const [threadId, setThreadId] = useState<string>(() => getLearningThreadId())
  const handleResetThread = useCallback(() => {
    setThreadId(resetLearningThreadId())
  }, [])

  const loadPath = useCallback(async () => {
    try {
      const result = await fetchLearningPath()
      setPath(result)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load learning path.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [pathResult, questionsResult] = await Promise.all([
          fetchLearningPath(),
          fetchLearningQuestions(),
        ])
        if (cancelled) return
        setPath(pathResult)
        setQuestions(questionsResult)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load learning data.')
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  async function handleGenerate(answers: Record<string, unknown>) {
    setGenerating(true)
    try {
      const newPath = await apiGenerateLearningPath(answers)
      setPath(newPath)
    } finally {
      setGenerating(false)
    }
  }

  // Still loading
  if (path === undefined && !loadError) {
    return (
      <DashboardLayout>
        <PageSkeleton />
      </DashboardLayout>
    )
  }

  // Error state
  if (loadError) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={loadPath}
            className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
          >
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  // No path yet — show conversational questionnaire or generating loader
  if (!path) {
    // Generation is in-flight — show the animated step loader
    if (generating) {
      return (
        <DashboardLayout>
          <div
            className="flex items-center justify-center h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white overflow-hidden"
            style={{ boxShadow: '0 16px 64px rgba(26, 10, 18, 0.24), 0 4px 20px rgba(26, 10, 18, 0.14)' }}
          >
            <LearningPathGeneratingLoader />
          </div>
        </DashboardLayout>
      )
    }
    return (
      <DashboardLayout>
        {questions.length > 0 ? (
          <ConversationalQuestionnaire questions={questions} onGenerate={handleGenerate} />
        ) : (
          <PageSkeleton />
        )}
      </DashboardLayout>
    )
  }

  // Has path — show chat
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white overflow-hidden" style={{ boxShadow: '0 16px 64px rgba(26, 10, 18, 0.24), 0 4px 20px rgba(26, 10, 18, 0.14)' }}>
        <EmbeddedLearningAssistant
          path={path}
          onPathRefresh={loadPath}
          threadId={threadId}
          onResetThread={handleResetThread}
        />
      </div>
    </DashboardLayout>
  )
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function LearningPage() {
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white shadow-sm animate-pulse" />
      </DashboardLayout>
    )
  }

  return (
    <CopilotKit
      runtimeUrl={VOICE_RUNTIME_URL}
      headers={getCopilotHeaders()}
      useSingleEndpoint={false}
      enableInspector={false}
      showDevConsole={false}
    >
      <LearningPageInner />
    </CopilotKit>
  )
}
