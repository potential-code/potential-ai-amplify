'use client'

/**
 * What the learner has in front of them inside a step whose state lives in a
 * child component (an exam in progress, a simulation round). Those components
 * report it here; the course page's Anna reads it so she knows the exact
 * question on screen. Nothing here ever carries an answer key.
 *
 * A tiny external store rather than context: the reporters sit deep in shared
 * LMS components that also render outside the course page, where reporting is
 * simply unread.
 */
import { useSyncExternalStore } from 'react'

export type LiveExam = {
  view: 'summary' | 'taking' | 'result'
  questionNumber?: number
  totalQuestions?: number
  question?: string
  options?: string[]
  answeredCount?: number
  score?: number | null
  passed?: boolean | null
  attemptsRemaining?: number | null
}

export type LiveSimulation = {
  scenarioNumber: number
  totalScenarios: number
  situation: string
  /** In the order shown on screen. */
  choices: string[]
  balance: string
  finished: boolean
  /** Once the learner has picked: their choice and the feedback now on screen. */
  picked?: { choice: string; feedback: string }
}

type LiveState = { exam: LiveExam | null; simulation: LiveSimulation | null }

let state: LiveState = { exam: null, simulation: null }
const listeners = new Set<() => void>()

export function setLiveStep<K extends keyof LiveState>(key: K, value: LiveState[K]): void {
  if (JSON.stringify(state[key]) === JSON.stringify(value)) return
  state = { ...state, [key]: value }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state
const getServerSnapshot = () => state

export function useLiveStep(): LiveState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
