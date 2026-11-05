/**
 * Client for /api/ai/tutor — the learner side of Anna as the Multi Learning
 * tutor. Types mirror server/services/tutor.service.ts.
 */

import { apiFetch } from '@/lib/api'

export type LearnerLanguage = 'en' | 'ar' | 'hi' | 'ur'

export type UnitStep =
  | { kind: 'intro'; unitId: string; blockIds: string[]; done: boolean }
  | { kind: 'video'; unitId: string; blockId: string; title: string; done: boolean }
  | { kind: 'reading'; unitId: string; blockIds: string[]; done: boolean }
  | { kind: 'action-plan'; unitId: string; blockId: string; done: boolean }

export interface StateUnit {
  unitId: string
  name: string
  moduleName: string
  order: number
  complete: boolean
  steps: UnitStep[]
}

export interface FinalQuiz {
  assessmentId: string
  title: string
  passingScore: number
  /** 0 means unlimited. */
  maxAttempts: number
  attemptsUsed: number
  bestScore: number | null
  passed: boolean
  locked: boolean
  done: boolean
}

export interface PreTest {
  assessmentId: string
  title: string
  done: boolean
}

export interface CourseSummary {
  courseId: string
  name: string
  progress: number
  complete: boolean
}

export type NextStep =
  | { action: 'show_courses'; reason: 'no_active_course' | 'course_complete' | 'quiz_not_passed' }
  | { action: 'show_unit_intro'; unitId: string }
  | { action: 'show_video'; unitId: string; learningBlockId: string }
  | { action: 'show_summary'; unitId: string }
  | { action: 'show_action_plan'; unitId: string; learningBlockId: string }
  | { action: 'show_quiz'; assessmentId: string; retake: boolean; pretest?: boolean }

export interface CourseState {
  language: LearnerLanguage
  courses: CourseSummary[]
  /** The course Interactive Learning opens first ("AI for SMEs"), when it exists. */
  featuredCourseId: string | null
  active: null | {
    courseId: string
    name: string
    progress: number
    units: StateUnit[]
    preTest: PreTest | null
    finalQuiz: FinalQuiz | null
    currentUnitId: string | null
    complete: boolean
  }
  next: NextStep
  text: string
}

export interface TutorProfile {
  firstName: string
  fullName: string
  company: string | null
  country: string | null
}

export interface UnitIntro {
  unitId: string
  title: string
  description: string
  introduction: string
  outcomes: string[]
}

export interface VideoLesson {
  learningBlockId: string
  unitId: string
  title: string
  videoUrl: string
  /** One question on the video, answered under it. Never carries the answer. */
  check: { questionId: string; text: string; options: string[]; answered: number | null } | null
}

export interface ActionPlan {
  learningBlockId: string
  unitId: string
  title: string
  prompts: Array<{ questionId: string; prompt: string; placeholder: string | null; answer: string | null }>
  done: boolean
}

export interface Quiz {
  assessmentId: string
  courseId: string
  /** A pre-test has no pass mark: any attempt is the learner's starting point. */
  kind: 'pre' | 'final'
  title: string
  description: string
  passingScore: number
  maxAttempts: number
  attemptsUsed: number
  passed: boolean
  questions: Array<{ questionId: string; text: string; options: string[] }>
}

export interface QuizResult {
  assessmentId: string
  kind: 'pre' | 'final'
  score: number
  passed: boolean
  passingScore: number
  correctCount: number
  gradedCount: number
  attemptsUsed: number
  maxAttempts: number
  canRetake: boolean
}

export interface TutorApi {
  profile(): Promise<TutorProfile>
  state(opts: { courseId?: string | null; introSeen?: string[] }): Promise<CourseState>
  unitIntro(unitId: string): Promise<UnitIntro>
  unitMaterial(unitId: string): Promise<unknown>
  video(learningBlockId: string): Promise<VideoLesson>
  actionPlan(learningBlockId: string): Promise<ActionPlan>
  submitActionPlan(learningBlockId: string, answers: Array<{ questionId: string; text: string }>): Promise<void>
  quiz(assessmentId: string): Promise<Quiz>
  submitQuiz(assessmentId: string, answers: Array<{ questionId: string; selectedIndex: number }>): Promise<QuizResult>
  complete(learningBlockIds: string[]): Promise<void>
  answerCheck(questionId: string, selectedIndex: number): Promise<{ correct: boolean; correctIndex: number }>
  resetCourse(courseId: string): Promise<void>
}

export function createTutorApi(lang: LearnerLanguage): TutorApi {
  const get = async <T,>(path: string): Promise<T> => {
    const res = await apiFetch<{ data: T }>(path)
    return res.data
  }
  const q = `lang=${lang}`
  return {
    profile: () => get<TutorProfile>('/api/ai/tutor/profile'),
    state: ({ courseId, introSeen }) => {
      const params = new URLSearchParams({ lang })
      if (courseId) params.set('courseId', courseId)
      if (introSeen?.length) params.set('introSeen', introSeen.join(','))
      return get<CourseState>(`/api/ai/tutor/state?${params}`)
    },
    unitIntro: (unitId) => get<UnitIntro>(`/api/ai/tutor/units/${unitId}/intro?${q}`),
    unitMaterial: (unitId) => get<unknown>(`/api/ai/tutor/units/${unitId}/material`),
    video: (id) => get<VideoLesson>(`/api/ai/tutor/videos/${id}?${q}`),
    actionPlan: (id) => get<ActionPlan>(`/api/ai/tutor/action-plans/${id}?${q}`),
    submitActionPlan: async (id, answers) => {
      await apiFetch(`/api/ai/tutor/action-plans/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      })
    },
    quiz: (id) => get<Quiz>(`/api/ai/tutor/quizzes/${id}?${q}`),
    submitQuiz: async (id, answers) => {
      const res = await apiFetch<{ data: QuizResult }>(`/api/ai/tutor/quizzes/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      })
      return res.data
    },
    complete: async (learningBlockIds) => {
      if (learningBlockIds.length === 0) return
      await apiFetch('/api/ai/tutor/progress/complete', {
        method: 'POST',
        body: JSON.stringify({ learningBlockIds }),
      })
    },
    answerCheck: async (questionId, selectedIndex) => {
      const res = await apiFetch<{ data: { correct: boolean; correctIndex: number } }>(`/api/ai/tutor/checks/${questionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ selectedIndex }),
      })
      return res.data
    },
    resetCourse: async (courseId) => {
      await apiFetch(`/api/ai/tutor/courses/${courseId}/reset`, { method: 'POST' })
    },
  }
}
