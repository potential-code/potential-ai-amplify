/**
 * The page state Anna reads on a course page: the course, the learner's
 * progress, and exactly what the open step shows. Built from what is already on
 * screen; answer keys never reach the browser, and simulation scoring (money
 * deltas, feedback, which choice is best) is left out until the learner picks.
 */
import type { LearnerBlock, LearnerCourseDetail } from '@/lib/api/lms'
import { blockKindLabel, blockLabel } from '@/components/learner/courseProgress'
import type { LiveExam, LiveSimulation } from './liveStep'

/** The step the page has open, in the page's own terms. */
export type SanaStep =
  | {
      kind: 'block'
      block: LearnerBlock
      unitNumber: number
      unitTitle: string
      stepInUnit: number
      stepsInUnit: number
    }
  | { kind: 'assessment'; assessmentType: 'pre' | 'post'; title: string; isLocked: boolean; isCompleted: boolean }

const MAX_TEXT = 6000

/** Plain text from lesson HTML/markdown, trimmed to what a prompt can carry. */
export function plainText(source: string | null | undefined, max = MAX_TEXT): string {
  if (!source) return ''
  const text = source
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function unitStatus(unit: LearnerCourseDetail['modules'][number]['units'][number]): string {
  if (unit.isLocked) return 'locked'
  const s = unit.unitProgress?.status
  return s === 'completed' ? 'done' : s === 'in_progress' ? 'in progress' : 'not started'
}

function blockOnScreen(block: LearnerBlock, simulation: LiveSimulation | null) {
  const base = { type: blockKindLabel(block), title: blockLabel(block) }
  switch (block.type) {
    case 'text':
      return { ...base, readingText: plainText(block.body) }
    case 'video':
      return {
        ...base,
        watchedPercent: Math.round(block.blockProgress?.videoWatchPct ?? 0),
        transcript: plainText(block.transcript) || 'No transcript for this video.',
      }
    case 'image':
      return base
    case 'question': {
      const actionPlan = block.questions.every((q) => q.kind === 'action-plan')
      return {
        ...base,
        note: actionPlan
          ? "The learner writes their own action plan. Help them think; don't write it for them."
          : 'Reflection questions: there are no wrong answers. Help them think; do not choose for them.',
        questions: block.questions.map((q) => ({
          prompt: q.prompt,
          format: q.format,
          ...(q.options?.length ? { options: q.options } : {}),
        })),
      }
    }
  }
}

function examOnScreen(step: Extract<SanaStep, { kind: 'assessment' }>, exam: LiveExam | null) {
  const name = step.assessmentType === 'pre' ? 'Pre-test' : 'Final exam'
  const base = {
    type: name,
    title: step.title,
    status: step.isLocked ? 'locked' : step.isCompleted ? 'completed' : 'not completed',
    note:
      step.assessmentType === 'pre'
        ? 'A short check of what the learner already knows, before the course. Never help answer its questions.'
        : 'The graded final exam. Never help answer its questions or explain the ideas they test while the learner is answering.',
  }
  if (!exam) return base
  if (exam.view === 'taking') {
    return {
      ...base,
      screen: 'answering questions',
      question: `${exam.questionNumber} of ${exam.totalQuestions}`,
      questionText: exam.question,
      options: exam.options,
      answered: exam.answeredCount,
    }
  }
  return {
    ...base,
    screen: exam.view === 'result' ? 'results' : 'start screen',
    questions: exam.totalQuestions,
    ...(exam.score != null ? { lastScore: `${exam.score}%`, passed: exam.passed } : {}),
    ...(exam.attemptsRemaining != null ? { attemptsLeft: exam.attemptsRemaining } : {}),
  }
}

export function buildCourseContext({
  course,
  step,
  nextLabel,
  learnerName,
  exam,
  simulation,
}: {
  course: LearnerCourseDetail
  step: SanaStep | null
  nextLabel: string | null
  learnerName: string | null
  exam: LiveExam | null
  simulation: LiveSimulation | null
}) {
  const courseInfo = {
    title: course.title,
    ...(course.description ? { description: plainText(course.description, 600) } : {}),
    ...(course.difficulty ? { level: course.difficulty } : {}),
    ...(course.category ? { category: course.category } : {}),
    certificate: course.enableCertificate ? 'awarded when the course is complete' : 'none',
  }

  if (!course.isEnrolled) {
    const p = course.preview
    return {
      page: 'Course overview, before starting. The learner has not started this course yet.',
      ...(learnerName ? { learner: learnerName } : {}),
      course: courseInfo,
      ...(p
        ? {
            units: p.units.map((u, i) => ({ unit: i + 1, title: u.title, ...(u.description ? { about: plainText(u.description, 300) } : {}) })),
            contains: p.totals,
            preTest: p.hasPreTest,
            finalExam: p.hasFinalExam,
          }
        : {}),
      howToStart: 'The "Start course" button on this page.',
    }
  }

  const units = course.modules.flatMap((m) => m.units)
  const done = units.filter((u) => u.unitProgress?.status === 'completed').length
  return {
    page: 'Course player',
    ...(learnerName ? { learner: learnerName } : {}),
    course: courseInfo,
    progress: {
      percent: Math.round(course.progressPercentage),
      unitsDone: `${done} of ${units.length}`,
      ...(course.preAssessment ? { preTest: course.preAssessment.isCompleted ? 'done' : 'not taken yet' } : {}),
      ...(course.postAssessment
        ? { finalExam: course.progressPercentage >= 100 ? 'passed' : course.postAssessment.isLocked ? 'locked until the units are done' : 'open' }
        : {}),
    },
    units: units.slice(0, 60).map((u, i) => ({ unit: i + 1, title: u.title, status: unitStatus(u) })),
    onScreen: !step
      ? 'Nothing open'
      : step.kind === 'assessment'
        ? examOnScreen(step, exam)
        : {
            where: `Unit ${step.unitNumber}: ${step.unitTitle}, step ${step.stepInUnit} of ${step.stepsInUnit}`,
            status: step.block.blockProgress?.status === 'completed' ? 'completed' : 'not completed yet',
            ...blockOnScreen(step.block, simulation),
          },
    ...(nextLabel ? { nextStep: nextLabel } : {}),
  }
}
