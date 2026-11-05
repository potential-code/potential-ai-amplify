import { createContext, useContext } from 'react'
import type { CourseState, LearnerLanguage, NextStep, TutorApi, UnitStep } from './api'
import type { TutorStrings } from './strings'

export interface TutorSession {
  ui: TutorStrings
  lang: LearnerLanguage
  dir: 'ltr' | 'rtl'
  api: TutorApi
  state: CourseState | null
  running: boolean
  /**
   * The id of the "card in hand": the newest show_* tool call that matches
   * the course state's NEXT STEP, or simply the newest one. Only this card
   * carries the lesson's action; older copies show a quiet "done" mark.
   */
  latestCallId: string | null
  /**
   * Where the learner actually is, for the course rail's NOW marker: the card
   * in hand when one is open (recording-on-display can advance the state's
   * NEXT STEP before the learner presses Continue), else the state's next.
   */
  now: NextStep | null
  /** Read Anna's replies aloud as they finish. */
  /** Refresh the course state from AI Amplify; resolves once Anna will see it. */
  refresh: () => Promise<CourseState | null>
  /** Open a course the learner picked, then tell Anna. */
  openCourse: (courseId: string, name: string) => Promise<void>
  /** Send a message to Anna. Hidden messages reach her but are not shown. */
  send: (text: string, opts?: { hidden?: boolean }) => Promise<void>
  /** Record that a unit's introduction was shown (units with no opening text). */
  markIntroSeen: (unitId: string) => void
  /** Describe the card in hand for Anna (e.g. the quiz question showing). */
  setOnScreen: (description: string) => void
  /** Where a step belongs, from the course state. */
  stepFor: (
    kind: UnitStep['kind'],
    id: string,
  ) => { step: UnitStep; unitOrder: number; unitName: string } | null
}

export const TutorContext = createContext<TutorSession | null>(null)

export function useTutor(): TutorSession {
  const session = useContext(TutorContext)
  if (!session) throw new Error('useTutor must be used inside TutorContext')
  return session
}
