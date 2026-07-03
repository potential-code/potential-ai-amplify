'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getUser, type User } from '@/lib/auth'
import { useCopilotTokenReady, getDashboardOverviewThreadId } from './copilotConfig'

// Re-export so existing imports (Overview, AiAssistant) keep working; the hook
// itself lives in copilotConfig so non-dashboard surfaces (landing chat) can
// use it without pulling in dashboard components.
export { useCopilotTokenReady }

const BASE_INSTRUCTIONS = `You are Anna — AI Amplify's AI Business Assistant.
AI Amplify is a global initiative by the Potential.org Foundation.

It gives SMEs and startups access to: AI training courses (with certificates and points), AI mentors (6 specialists, 24/7), AI business tools (Business Plan, Marketing Plan, Business Ideas, Product Proposal — all as PDFs), human expert sessions (15+ mentors to book 1:1), exclusive partner offers (redeemable with course-completion points), and live events.

Your job is to help the logged-in user grow their business. You can:
- Generate business plans, marketing plans, product proposals, and business ideas tailored to the user.
- Recommend AI Amplify courses, AI mentors, human mentors, and partner offers when relevant.
- Answer questions about the AI Amplify program, its features, courses, points, certificates, offers, and events.

Be concise, practical, and warm. Use bullet points and short sections. When you suggest a course, mentor, offer or event, refer to it by name.`

const InstructionsContext = createContext<string>(BASE_INSTRUCTIONS)
const SharedAssistantThreadContext = createContext<string>('')
// Resets the shared thread to a brand-new id, starting a fresh conversation
// (new backend LangGraph thread = no checkpointed history).
const ResetAssistantThreadContext = createContext<() => void>(() => {})

export function useAssistantInstructions() {
  return useContext(InstructionsContext)
}

export function useSharedAssistantThreadId() {
  return useContext(SharedAssistantThreadContext)
}

export function useResetAssistantThread() {
  return useContext(ResetAssistantThreadContext)
}

function buildInstructions(user: User | null): string {
  if (!user) return BASE_INSTRUCTIONS
  return `${BASE_INSTRUCTIONS}\n\nThe user is ${user.fullName} (${user.country ?? 'location unknown'}).`
}

/**
 * Dashboard-level assistant contexts. NOTE: this no longer mounts a CopilotKit
 * provider — the old v1 popup it served was never rendered, and its provider
 * fired an unauthenticated runtime request on every dashboard load. The v2
 * surfaces (Overview / AiAssistant) own their providers; this component now
 * only supplies the shared instructions/thread contexts and warms the copilot
 * service token.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getUser())
  const [sharedAssistantThreadId, setSharedAssistantThreadId] = useState<string>(() =>
    getDashboardOverviewThreadId(),
  )
  const resetAssistantThread = useCallback(() => {
    setSharedAssistantThreadId(getDashboardOverviewThreadId())
  }, [])
  // Mint the copilot service token as soon as the dashboard loads.
  useCopilotTokenReady()

  useEffect(() => {
    const refresh = () => setUser(getUser())
    window.addEventListener('smeep:auth-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('smeep:auth-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const instructions = useMemo(() => buildInstructions(user), [user])

  return (
    <InstructionsContext.Provider value={instructions}>
      <SharedAssistantThreadContext.Provider value={sharedAssistantThreadId}>
        <ResetAssistantThreadContext.Provider value={resetAssistantThread}>
          {children}
        </ResetAssistantThreadContext.Provider>
      </SharedAssistantThreadContext.Provider>
    </InstructionsContext.Provider>
  )
}
