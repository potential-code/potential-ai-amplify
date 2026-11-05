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
  apiRegenerateLearningPath,
  type ActiveLearningPath,
  type LearningQuestion,
} from '@/lib/api/lms'
import { LearningPathGeneratingLoader } from '@/components/shared/LearningPathGeneratingLoader'
import { JourneyLoading, JourneyMessage, JourneyBuilding } from '@/components/journeys/JourneyStates'
import { btn } from '@/components/kit'
import Link from 'next/link'
import '@/components/learning-ui/sana-studio.css'

// ── CopilotKit URLs ───────────────────────────────────────────────────────────

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

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
    // Clear a previous failure first, or Retry keeps showing the old error.
    setLoadError(null)
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

  // Re-personalization: rebuild the path reusing the learner's stored
  // questionnaire answers, current progress and the LATEST platform setup.
  // Same full-screen loader as first-time generation.
  const handleRegenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const newPath = await apiRegenerateLearningPath()
      setPath(newPath)
    } finally {
      setGenerating(false)
    }
  }, [])

  // Still loading
  if (path === undefined && !loadError) {
    return (
      <DashboardLayout fullBleed>
        <JourneyLoading title="Learning Path" />
      </DashboardLayout>
    )
  }

  // Generation or regeneration in flight — full-screen step loader either way.
  if (generating) {
    return (
      <DashboardLayout fullBleed>
        <JourneyBuilding title="Learning Path" subtitle="Anna is building your path" sanaLine="I'm matching our course catalog to your answers.">
          <LearningPathGeneratingLoader />
        </JourneyBuilding>
      </DashboardLayout>
    )
  }

  // Error state
  if (loadError) {
    return (
      <DashboardLayout fullBleed>
        <JourneyMessage
          title="Learning Path"
          heading="We couldn't load your learning path"
          body={loadError}
          action={
            <button type="button" onClick={loadPath} className={btn({ variant: 'primary', size: 'md' })}>
              Retry
            </button>
          }
        />
      </DashboardLayout>
    )
  }

  // No path yet — show the conversational questionnaire
  if (!path) {
    if (questions.length > 0) {
      return (
        <DashboardLayout fullBleed>
          <ConversationalQuestionnaire questions={questions} onGenerate={handleGenerate} />
        </DashboardLayout>
      )
    }
    // Load finished but no questionnaire exists — the platform-wide learning
    // setup hasn't been run yet. Without this branch the page showed
    // skeletons forever on every fresh deployment.
    return (
      <DashboardLayout fullBleed>
        <JourneyMessage
          title="Learning Path"
          heading="Personalized learning paths aren't ready yet"
          body="We're still preparing this experience. In the meantime, you can browse and start any course from the Courses page."
          action={
            <Link href="/dashboard/courses" className={btn({ variant: 'primary', size: 'md' })}>
              Browse courses
            </Link>
          }
        />
      </DashboardLayout>
    )
  }

  // Has path — show chat
  return (
    <DashboardLayout fullBleed>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EmbeddedLearningAssistant
          path={path}
          onPathRefresh={loadPath}
          onRegenerate={handleRegenerate}
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
      <DashboardLayout fullBleed>
        <JourneyLoading title="Learning Path" />
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
