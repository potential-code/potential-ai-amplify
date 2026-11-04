'use client'

/**
 * Shared helpers for the learner pages (Home, Courses, Certificates): read the
 * real course detail for each enrolled course (same react-query key the course
 * page uses, so the cache is shared) and summarise where the learner is.
 */
import { useQueries } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Calculator,
  Cpu,
  Handshake,
  Lightbulb,
  Rocket,
  Users,
} from 'lucide-react'
import {
  fetchLearnerCourse,
  type LearnerBlock,
  type LearnerCourse,
  type LearnerCourseDetail,
  type LearnerUnit,
} from '@/lib/api/lms'
import type { CourseTopic } from '@/lib/api/redesign'

/** Course list rows, plus fields the backend is adding in the redesign. */
export type CourseListItem = LearnerCourse & {
  category?: CourseTopic | null
  unitCount?: number
  hasFinalExam?: boolean
}

export function courseHref(id: string) {
  return `/dashboard/courses/${id}`
}

/** Icon for a cover tile when a course has no image. */
export function topicIcon(topic: CourseTopic | null | undefined): LucideIcon {
  switch (topic) {
    case 'Money and finance':
      return Calculator
    case 'Sales and customers':
      return Handshake
    case 'People and leadership':
      return Users
    case 'Digital and AI':
      return Cpu
    case 'Starting a business':
      return Rocket
    case 'Personal effectiveness':
      return Lightbulb
    default:
      return Briefcase
  }
}

export type StepState = 'done' | 'current' | 'todo'
export type UnitStep = { id: string; label: string; state: StepState }

/** "Read More" -> "Read more"; survey blocks get a plain label. */
export function stepLabel(block: LearnerBlock): string {
  if (block.type === 'question') {
    const kinds = new Set(block.questions.map((q) => q.kind))
    if (kinds.size === 1 && kinds.has('action-plan')) return 'Action plan'
    if (kinds.has('survey') && !kinds.has('action-plan')) return 'Survey'
  }
  const t = block.title.trim()
  if (t && t.length <= 24) return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  if (block.type === 'video') return 'Video'
  if (block.type === 'image') return 'Image'
  return 'Read'
}

export type CourseSummary = {
  id: string
  title: string
  cover: string | null
  progress: number
  totalUnits: number
  completedUnits: number
  /** 1-based index of the unit the learner is on (or last unit when all done). */
  currentUnitNumber: number
  currentUnit: LearnerUnit | null
  steps: UnitStep[]
  allUnitsDone: boolean
  finalExam: { questions: number; passingScore: number; isGraded: boolean } | null
  lastActivity: string | null
}

export function summarizeCourse(course: LearnerCourseDetail): CourseSummary {
  const units = course.modules.flatMap((m) => m.units)
  const completedUnits = units.filter((u) => u.unitProgress?.status === 'completed').length
  const currentIdx = units.findIndex((u) => u.unitProgress?.status !== 'completed')
  const idx = currentIdx >= 0 ? currentIdx : Math.max(0, units.length - 1)
  const currentUnit = units[idx] ?? null

  let currentAssigned = false
  const steps: UnitStep[] = (currentUnit?.blocks ?? []).map((b) => {
    const done = b.blockProgress?.status === 'completed'
    let state: StepState = done ? 'done' : 'todo'
    if (!done && !currentAssigned && currentIdx >= 0) {
      state = 'current'
      currentAssigned = true
    }
    return { id: b.id, label: stepLabel(b), state }
  })

  const post = course.postAssessment as (LearnerCourseDetail['postAssessment'] & { questions?: unknown[] }) | null
  const cp = course.courseProgress as (LearnerCourseDetail['courseProgress'] & { updatedAt?: string | null }) | null

  return {
    id: course.id,
    title: course.title,
    cover: course.cover,
    progress: Math.round(course.progressPercentage),
    totalUnits: units.length,
    completedUnits,
    currentUnitNumber: idx + 1,
    currentUnit,
    steps,
    allUnitsDone: currentIdx < 0 && units.length > 0,
    finalExam: post
      ? { questions: post.questions?.length ?? 0, passingScore: post.passingScore, isGraded: post.isGraded }
      : null,
    lastActivity: cp?.updatedAt ?? null,
  }
}

/** Fetches full detail for the given course ids (shares the course page cache). */
export function useCourseSummaries(ids: string[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['learner-course', id],
      queryFn: () => fetchLearnerCourse(id),
      staleTime: 30_000,
    })),
  })
  const byId = new Map<string, CourseSummary>()
  results.forEach((r) => {
    if (r.data) byId.set(r.data.id, summarizeCourse(r.data))
  })
  return { byId, isLoading: results.some((r) => r.isLoading) }
}

export function sortByRecent(a: CourseSummary | undefined, b: CourseSummary | undefined) {
  const ta = a?.lastActivity ? Date.parse(a.lastActivity) : 0
  const tb = b?.lastActivity ? Date.parse(b.lastActivity) : 0
  return tb - ta
}
