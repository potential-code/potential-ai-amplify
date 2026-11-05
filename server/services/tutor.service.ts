import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  assessmentAttempts,
  assessmentQuestions,
  assessments,
  blockQuestions,
  courseEnrollments,
  courses,
  learningBlocks,
  modules,
  questionAnswers,
  units,
  userCourseProgress,
  userLearningBlockProgress,
  userModuleProgress,
  userUnitProgress,
  users,
} from '../db/schema'
import { saveQuestionAnswer, updateBlockProgress } from './lms/progress.service'
import { submitAttempt } from './lms/assessment.service'
import { translateContent, type TranslationDomain } from './tutorTranslation.service'
import { AppError } from '../utils/app-error'

/**
 * The learner side of Anna as the Multi Learning tutor (potential-ai's
 * smeepTutor graph). Ported from VX Academy's learningAgent service.
 *
 * Anna does not hold the course. The Multi Learning page asks this service
 * where the learner is, sends that to Anna as the course-state readable
 * (ending in a NEXT STEP line she must follow), and renders the cards she
 * opens from the payloads built here. So:
 *
 *   - progress, step order and completion come from the database, never from
 *     the model's memory or from keywords in its replies;
 *   - unit, video and quiz cards carry AI Amplify's own content, so every learner
 *     sees the same wording and the model can neither invent a question nor
 *     reorder options;
 *   - quiz answer keys never leave this server. Grading reuses the classic
 *     LMS assessment pipeline (submitAttempt), which also recalculates course
 *     progress and auto-issues the certificate.
 *
 * A unit is delivered as ordered steps derived from its learning blocks:
 *
 *   intro        the unit's title, description and leading text blocks
 *   video        one per video block
 *   reading      consecutive text blocks after a video; Anna summarises them
 *   action-plan  the unit's action-plan question block — the learner writes
 *                their own plan, saved to the same question_answers store the
 *                classic course page uses
 *
 * The unit's remaining question block (the "complete unit N" self-check
 * survey, no answer keys) is not a step: it auto-completes once every other
 * block in the unit is done, so classic progress, unit locks and the
 * certificate line up with the tutor flow. The graded quiz is the COURSE's
 * post assessment, taken after the last unit — the same final exam the
 * classic page offers, shared attempts and all. Image and simulation blocks
 * are not steps.
 *
 * The catalogue's text blocks have fixed editorial roles (audited across all
 * 47 courses): "Read" is the video's outline, "Read More" is the video's
 * narration transcript, "Case Study" and "Quotes" are supplements. The unit
 * material tags them so the model summarises instead of re-telling the video.
 */

export type LearnerLanguage = 'en' | 'ar' | 'hi' | 'ur'

export function isLearnerLanguage(value: unknown): value is LearnerLanguage {
  return value === 'en' || value === 'ar' || value === 'hi' || value === 'ur'
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(ZERO_WIDTH, '').replace(/[ \t]+/g, ' ').trim()
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&rdquo;': '"',
  '&ldquo;': '"',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? (m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) || m : m))
}

/**
 * AI Amplify stores learning-block bodies as HTML. Convert to Markdown-ish text:
 * headings, list items, bold/italic, paragraph breaks; every other tag is
 * stripped. Plain-text input passes through unchanged.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  let text = html.replace(ZERO_WIDTH, '')
  if (!/[<>]/.test(text)) return clean(text)

  text = text
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*h([1-6])[^>]*>/gi, (_m, level) => `\n\n${'#'.repeat(Math.min(Math.max(Number(level), 2), 4))} `)
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*li\s*>/gi, '')
    .replace(/<\s*(p|div|ul|ol|blockquote|table|tr)[^>]*>/gi, '\n\n')
    .replace(/<\s*\/\s*(p|div|ul|ol|blockquote|table|tr)\s*>/gi, '\n\n')
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => {
      const trimmed = String(inner).trim()
      return trimmed ? `**${trimmed}**` : ''
    })
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => {
      const trimmed = String(inner).trim()
      return trimmed ? `*${trimmed}*` : ''
    })
    .replace(/<[^>]+>/g, '')

  return decodeEntities(text)
    .split('\n')
    .map((line) => clean(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // A heading inside a list item (<li><h5>…) leaves a dangling dash; rejoin it.
    .replace(/-\n+#{2,4} /g, '- ')
    .trim()
}

/** The items of a Markdown list, if the text contains one. */
function listItems(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.match(/^\s*(?:-|\*|\d+\.)\s+(.*)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
}

/** Up to `count` opening sentences of plain text, cut at a sentence end within `max` characters. */
function firstSentences(text: string, count: number, max: number): string {
  const sentences = text.trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? []
  let out = ''
  for (const s of sentences.slice(0, count)) {
    if ((out + s).length > max) break
    out += s
  }
  return out.trim()
}

const OUTCOMES_HEADING =
  /by the end of (this|the) unit|learning outcomes|you will (be able to|learn)|learners will be able to/i

/** The editorial role of a text block, from its (very consistent) title. */
export type TextRole = 'outline' | 'transcript' | 'case-study' | 'quotes' | 'text'

function textRoleOf(title: string | null | undefined): TextRole {
  switch (clean(title).toLowerCase()) {
    case 'read':
      return 'outline'
    case 'read more':
      return 'transcript'
    case 'case study':
      return 'case-study'
    case 'quotes':
      return 'quotes'
    default:
      return 'text'
  }
}

/**
 * Translation seam. English passes through; other languages translate via the
 * shared cache (tutorTranslation.service — potential-ai backed, translated
 * once per string per language). Failures fall back to the English original.
 */
async function translator(
  lang: LearnerLanguage,
  texts: Array<string | null | undefined>,
  domain: TranslationDomain = 'lesson',
): Promise<(t: string) => string> {
  if (lang === 'en') return (t: string) => t
  return translateContent(texts, lang, domain)
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** Published course ids the learner is enrolled in. */
async function learnerCourseIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ courseId: courseEnrollments.courseId })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, userId), eq(courses.status, 'published')))
  return rows.map((r) => r.courseId)
}

async function assertCourseAccess(userId: string, courseId: string): Promise<void> {
  const ids = await learnerCourseIds(userId)
  if (!ids.includes(courseId)) throw new AppError('Course not available to this learner', 404, 'COURSE_NOT_FOUND')
}

/** A unit is available when it belongs to a course the learner is enrolled in. */
async function assertUnitAccess(userId: string, unitId: string): Promise<string> {
  const ids = await learnerCourseIds(userId)
  if (ids.length === 0) throw new AppError('Unit not available to this learner', 404, 'UNIT_NOT_FOUND')
  const [row] = await db
    .select({ courseId: modules.courseId })
    .from(units)
    .innerJoin(modules, eq(modules.id, units.moduleId))
    .where(and(eq(units.id, unitId), inArray(modules.courseId, ids)))
    .limit(1)
  if (!row) throw new AppError('Unit not available to this learner', 404, 'UNIT_NOT_FOUND')
  return row.courseId
}

// ---------------------------------------------------------------------------
// Course state
// ---------------------------------------------------------------------------

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

/** The course's graded final exam (its post assessment), with attempt state. */
export interface FinalQuiz {
  assessmentId: string
  title: string
  passingScore: number
  /** 0 means unlimited. */
  maxAttempts: number
  attemptsUsed: number
  bestScore: number | null
  passed: boolean
  /** Attempts exhausted without a pass: the learner cannot retake it here. */
  locked: boolean
  done: boolean
}

/**
 * The course's pre-test. It comes before the first unit, as on the course
 * page: an ungraded one is done once taken, a graded one once passed.
 */
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
  /** The same state as prose for the model, ending in a NEXT STEP line. */
  text: string
}

async function listCourses(userId: string, lang: LearnerLanguage, featuredId: string | null): Promise<CourseSummary[]> {
  const rows = await db
    .select({ courseId: courses.id, name: courses.title })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, userId), eq(courses.status, 'published')))
  if (rows.length === 0) return []

  const progress = await db
    .select({
      courseId: userCourseProgress.courseId,
      pct: userCourseProgress.progressPercentage,
      completedAt: userCourseProgress.completedAt,
    })
    .from(userCourseProgress)
    .where(
      and(
        eq(userCourseProgress.userId, userId),
        inArray(
          userCourseProgress.courseId,
          rows.map((r) => r.courseId),
        ),
      ),
    )
  const byCourse = new Map(progress.map((p) => [p.courseId, p]))
  const t = await translator(lang, rows.map((r) => r.name), 'catalogue')

  const list = rows.map((r) => {
    const p = byCourse.get(r.courseId)
    const percent = Math.round(Number(p?.pct ?? 0)) || 0
    return {
      courseId: r.courseId,
      name: clean(t(r.name)),
      progress: percent,
      complete: Boolean(p?.completedAt) || percent >= 100,
    }
  })
  // The featured course leads the list.
  return featuredId ? [...list.filter((c) => c.courseId === featuredId), ...list.filter((c) => c.courseId !== featuredId)] : list
}

/** Build every unit of a course as ordered steps, with the learner's progress. */
async function buildUnits(
  userId: string,
  courseId: string,
  lang: LearnerLanguage,
  introSeen: ReadonlySet<string>,
): Promise<StateUnit[]> {
  const moduleRows = await db
    .select({ id: modules.id, title: modules.title, order: modules.order })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.order))
  const moduleIds = moduleRows.map((m) => m.id)
  const unitRows = moduleIds.length
    ? await db
        .select({ id: units.id, moduleId: units.moduleId, title: units.title, order: units.order })
        .from(units)
        .where(inArray(units.moduleId, moduleIds))
        .orderBy(asc(units.order))
    : []
  if (unitRows.length === 0) return []

  // Flatten units across modules in course order.
  const moduleOrder = new Map(moduleRows.map((m) => [m.id, m.order]))
  const moduleName = new Map(moduleRows.map((m) => [m.id, m.title]))
  const ordered = [...unitRows].sort(
    (a, b) => (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0) || a.order - b.order,
  )

  const unitIds = ordered.map((u) => u.id)
  const blockRows = await db
    .select({
      id: learningBlocks.id,
      unitId: learningBlocks.unitId,
      type: learningBlocks.type,
      title: learningBlocks.title,
      order: learningBlocks.order,
    })
    .from(learningBlocks)
    .where(inArray(learningBlocks.unitId, unitIds))
    .orderBy(asc(learningBlocks.order))

  const questionBlockIds = blockRows.filter((b) => b.type === 'question').map((b) => b.id)
  const [blockProgress, questionKinds] = await Promise.all([
    blockRows.length
      ? db
          .select({
            id: userLearningBlockProgress.learningBlockId,
            status: userLearningBlockProgress.status,
          })
          .from(userLearningBlockProgress)
          .where(
            and(
              eq(userLearningBlockProgress.userId, userId),
              inArray(
                userLearningBlockProgress.learningBlockId,
                blockRows.map((b) => b.id),
              ),
            ),
          )
      : Promise.resolve([] as Array<{ id: string; status: string }>),
    questionBlockIds.length
      ? db
          .select({ blockId: blockQuestions.blockId, kind: blockQuestions.kind })
          .from(blockQuestions)
          .where(inArray(blockQuestions.blockId, questionBlockIds))
      : Promise.resolve([] as Array<{ blockId: string; kind: string }>),
  ])

  const completedBlocks = new Set(blockProgress.filter((p) => p.status === 'completed').map((p) => p.id))
  // A question block is the unit's action plan when its questions are
  // action-plan kind; every other question block is the self-check survey
  // (auto-completed, never a step). Kinds are never mixed within a block.
  const actionPlanBlocks = new Set(questionKinds.filter((q) => q.kind === 'action-plan').map((q) => q.blockId))
  const t = await translator(lang, [...ordered.map((u) => u.title), ...moduleRows.map((m) => m.title)], 'catalogue')

  return ordered.map((unit, index) => {
    const blocks = blockRows.filter((b) => b.unitId === unit.id)
    const steps: UnitStep[] = []

    // Leading text blocks belong to the introduction.
    let i = 0
    const introBlockIds: string[] = []
    while (i < blocks.length && blocks[i]!.type === 'text') introBlockIds.push(blocks[i++]!.id)

    let reading: string[] = []
    const flushReading = () => {
      if (reading.length === 0) return
      steps.push({
        kind: 'reading',
        unitId: unit.id,
        blockIds: reading,
        done: reading.every((id) => completedBlocks.has(id)),
      })
      reading = []
    }
    for (; i < blocks.length; i++) {
      const b = blocks[i]!
      if (b.type === 'text') {
        reading.push(b.id)
        continue
      }
      // Image, simulation and survey blocks are not steps of their own.
      if (b.type !== 'video') continue
      flushReading()
      steps.push({ kind: 'video', unitId: unit.id, blockId: b.id, title: clean(b.title), done: completedBlocks.has(b.id) })
    }
    flushReading()

    // The action plan always sits at the end of a unit (audited: one per
    // unit, second-to-last, 334 of 354 units have one).
    const actionPlan = blocks.find((b) => b.type === 'question' && actionPlanBlocks.has(b.id))
    if (actionPlan) {
      steps.push({ kind: 'action-plan', unitId: unit.id, blockId: actionPlan.id, done: completedBlocks.has(actionPlan.id) })
    }

    // The intro is done once anything in the unit has been done, or its
    // opening text is recorded, or (a unit with no opening text) the page
    // says the learner has seen it this session.
    const anythingDone = steps.some((s) => s.done)
    const introDone =
      anythingDone ||
      introSeen.has(unit.id) ||
      (introBlockIds.length > 0 && introBlockIds.every((id) => completedBlocks.has(id)))
    steps.unshift({ kind: 'intro', unitId: unit.id, blockIds: introBlockIds, done: introDone })

    return {
      unitId: unit.id,
      name: clean(t(unit.title)),
      moduleName: clean(t(moduleName.get(unit.moduleId) ?? '')),
      order: index + 1,
      complete: steps.every((s) => s.done),
      steps,
    }
  })
}

/** The course's graded post assessment with the learner's attempt state. */
async function buildPreTest(userId: string, courseId: string, lang: LearnerLanguage): Promise<PreTest | null> {
  const [assessment] = await db
    .select({ id: assessments.id, title: assessments.title, isGraded: assessments.isGraded })
    .from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.assessmentType, 'pre')))
    .limit(1)
  if (!assessment) return null
  const [question] = await db
    .select({ id: assessmentQuestions.id })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessment.id))
    .limit(1)
  if (!question) return null

  const attempts = await db
    .select({ passed: assessmentAttempts.passed })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessment.id)))
  const t = await translator(lang, [assessment.title])
  return {
    assessmentId: assessment.id,
    title: clean(t(assessment.title)),
    done: assessment.isGraded ? attempts.some((a) => a.passed === true) : attempts.length > 0,
  }
}

async function buildFinalQuiz(
  userId: string,
  courseId: string,
  lang: LearnerLanguage,
): Promise<FinalQuiz | null> {
  const [assessment] = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      passingScore: assessments.passingScore,
      maxAttempts: assessments.maxAttempts,
      isGraded: assessments.isGraded,
    })
    .from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.assessmentType, 'post')))
    .limit(1)
  if (!assessment || !assessment.isGraded) return null

  const attempts = await db
    .select({ score: assessmentAttempts.score, passed: assessmentAttempts.passed })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessment.id)))

  const passed = attempts.some((a) => a.passed === true)
  const locked = !passed && assessment.maxAttempts > 0 && attempts.length >= assessment.maxAttempts
  const scores = attempts.map((a) => a.score).filter((s): s is number => typeof s === 'number')
  const t = await translator(lang, [assessment.title])
  return {
    assessmentId: assessment.id,
    title: clean(t(assessment.title)),
    passingScore: assessment.passingScore,
    maxAttempts: assessment.maxAttempts,
    attemptsUsed: attempts.length,
    bestScore: scores.length ? Math.max(...scores) : null,
    passed,
    locked,
    done: passed || locked,
  }
}

function nextStepOf(unitsList: StateUnit[], finalQuiz: FinalQuiz | null, preTest: PreTest | null): NextStep {
  // The pre-test opens the course, as on the course page.
  if (preTest && !preTest.done) {
    return { action: 'show_quiz', assessmentId: preTest.assessmentId, retake: false, pretest: true }
  }
  for (const unit of unitsList) {
    const step = unit.steps.find((s) => !s.done)
    if (!step) continue
    switch (step.kind) {
      case 'intro':
        return { action: 'show_unit_intro', unitId: unit.unitId }
      case 'video':
        return { action: 'show_video', unitId: unit.unitId, learningBlockId: step.blockId }
      case 'reading':
        return { action: 'show_summary', unitId: unit.unitId }
      case 'action-plan':
        return { action: 'show_action_plan', unitId: unit.unitId, learningBlockId: step.blockId }
    }
  }
  // Every unit is behind the learner; the final exam decides the rest.
  if (finalQuiz && !finalQuiz.done) {
    return { action: 'show_quiz', assessmentId: finalQuiz.assessmentId, retake: finalQuiz.attemptsUsed > 0 }
  }
  return {
    action: 'show_courses',
    reason: finalQuiz?.locked ? 'quiz_not_passed' : 'course_complete',
  }
}

function stepLabel(step: UnitStep): string {
  const mark = step.done ? 'done' : 'to do'
  switch (step.kind) {
    case 'intro':
      return `introduction (${mark})`
    case 'video':
      return `video learningBlockId=${step.blockId} (${mark})`
    case 'reading':
      return `reading and summary (${mark})`
    case 'action-plan':
      return `action plan learningBlockId=${step.blockId} (${mark})`
  }
}

function finalQuizLabel(quiz: FinalQuiz): string {
  const result = quiz.passed
    ? `PASSED, best score ${quiz.bestScore}%`
    : quiz.locked
      ? `NOT PASSED and locked after ${quiz.attemptsUsed} attempts`
      : `${quiz.attemptsUsed}${quiz.maxAttempts > 0 ? ` of ${quiz.maxAttempts}` : ''} attempts used${quiz.bestScore !== null ? `, best score ${quiz.bestScore}%` : ''}`
  return `Final exam (assessmentId=${quiz.assessmentId}) ${quiz.title}: ${result}; pass mark ${quiz.passingScore}%`
}

function nextStepText(next: NextStep): string {
  switch (next.action) {
    case 'show_courses':
      if (next.reason === 'course_complete') {
        return "The active course is COMPLETE. Congratulate the learner in one short sentence, then show the learner's courses (show_courses)."
      }
      if (next.reason === 'quiz_not_passed') {
        return "Every lesson of this course has been taken, but the final exam was NOT passed and has no attempts left, so the course is NOT complete. Say so kindly in one sentence: an admin can reset that exam. Never congratulate them on finishing. Then show the learner's courses (show_courses)."
      }
      return "No course is open. Show the learner's courses (show_courses) so they can choose one."
    case 'show_unit_intro':
      return `Show the unit introduction: show_unit_intro with unitId=${next.unitId}.`
    case 'show_video':
      return `Show the video: show_video with learningBlockId=${next.learningBlockId}.`
    case 'show_summary':
      return `Summarise the unit with unitId=${next.unitId}: call load_unit with unitId=${next.unitId} if its material is not loaded in this conversation, then show_summary with unitId=${next.unitId}.`
    case 'show_action_plan':
      return `Show the unit's action plan: show_action_plan with learningBlockId=${next.learningBlockId}. The learner writes their own plan on the card; never write it for them.`
    case 'show_quiz':
      if (next.pretest) {
        return `Show the pre-test: show_quiz with assessmentId=${next.assessmentId}. It comes before the first unit: a quick check of what the learner already knows, so their progress can be measured. It has no pass mark and does not affect the certificate; taking it opens the lessons.`
      }
      return `Show the final exam: show_quiz with assessmentId=${next.assessmentId}.${next.retake ? ' This is a retake; encourage the learner briefly.' : ''}`
  }
}

function stateText(
  coursesList: CourseSummary[],
  active: CourseState['active'],
  next: NextStep,
): string {
  const lines: string[] = []
  lines.push(
    coursesList.length
      ? `Enrolled courses: ${coursesList
          .map((c) => `${c.name} (courseId=${c.courseId}, ${c.complete ? 'COMPLETE' : `${c.progress}%`})`)
          .join('; ')}.`
      : 'The learner is not enrolled in any course.',
  )
  if (active) {
    const done = active.units.filter((u) => u.complete).length
    lines.push(
      `Active course (courseId=${active.courseId}) ${active.name}, ${done} of ${active.units.length} units COMPLETE${active.complete ? ' — the course is COMPLETE' : ''}.`,
    )
    if (active.preTest) lines.push(`- Pre-test (assessmentId=${active.preTest.assessmentId}): ${active.preTest.done ? 'done' : 'to do, before the first unit'}`)
    for (const unit of active.units) {
      lines.push(
        `- Unit ${unit.order} (unitId=${unit.unitId}) ${unit.name}: ${unit.complete ? 'COMPLETE' : unit.steps.map(stepLabel).join(', ')}${unit.unitId === active.currentUnitId ? ' ← current' : ''}`,
      )
    }
    if (active.finalQuiz) lines.push(`- ${finalQuizLabel(active.finalQuiz)}`)
  } else {
    lines.push('No active course.')
  }
  lines.push(`NEXT STEP: ${nextStepText(next)}`)
  return lines.join('\n')
}

/**
 * Where the learner is, as data for the page (course rail) and as prose for
 * Anna (the course-state readable).
 *
 * `introSeen` carries units whose introduction the page has shown this session
 * but that have no opening text to record it by.
 */
export async function getCourseState(
  userId: string,
  options: { courseId?: string; lang: LearnerLanguage; introSeen?: string[] },
): Promise<CourseState> {
  const { lang } = options
  // AI Amplify has no featured course (SMEEP's demo opens one first).
  const featuredCourseId: string | null = null
  const coursesList = await listCourses(userId, lang, featuredCourseId)

  let active: CourseState['active'] = null
  let next: NextStep = { action: 'show_courses', reason: 'no_active_course' }

  if (options.courseId) {
    await assertCourseAccess(userId, options.courseId)
    const [unitsList, finalQuiz, preTest] = await Promise.all([
      buildUnits(userId, options.courseId, lang, new Set(options.introSeen ?? [])),
      buildFinalQuiz(userId, options.courseId, lang),
      buildPreTest(userId, options.courseId, lang),
    ])
    const summary = coursesList.find((c) => c.courseId === options.courseId)
    next = nextStepOf(unitsList, finalQuiz, preTest)
    const current = 'unitId' in next ? next.unitId : null
    active = {
      courseId: options.courseId,
      name: summary?.name ?? '',
      progress: summary?.progress ?? 0,
      units: unitsList,
      preTest,
      finalQuiz,
      currentUnitId: current,
      complete: unitsList.length > 0 && unitsList.every((u) => u.complete) && (!finalQuiz || finalQuiz.passed),
    }
  }

  return { language: lang, courses: coursesList, featuredCourseId, active, next, text: stateText(coursesList, active, next) }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

async function unitWithBlocks(unitId: string) {
  const [unit] = await db
    .select({ id: units.id, title: units.title, description: units.description })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1)
  if (!unit) throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND')
  const blocks = await db
    .select({
      id: learningBlocks.id,
      type: learningBlocks.type,
      title: learningBlocks.title,
      body: learningBlocks.body,
      transcript: learningBlocks.transcript,
      videoUrl: learningBlocks.videoUrl,
    })
    .from(learningBlocks)
    .where(eq(learningBlocks.unitId, unitId))
    .orderBy(asc(learningBlocks.order))
  return { unit, blocks }
}

export interface UnitIntroCard {
  unitId: string
  title: string
  description: string
  introduction: string
  outcomes: string[]
}

export async function getUnitIntro(userId: string, unitId: string, lang: LearnerLanguage): Promise<UnitIntroCard> {
  await assertUnitAccess(userId, unitId)
  const { unit, blocks } = await unitWithBlocks(unitId)
  const leading: string[] = []
  for (const b of blocks) {
    if (b.type !== 'text') break
    const text = htmlToMarkdown(b.body)
    if (text) leading.push(text)
  }
  // AI Amplify units are video-first, so almost none have opening text. The unit's
  // "Read" block — the lesson's outline — is the right preview: show it on the
  // intro card instead of a stock line. (Its completion stays with the reading
  // step; the intro only previews it.)
  if (leading.length === 0) {
    const outline = blocks.find((b) => b.type === 'text' && textRoleOf(b.title) === 'outline')
    const text = htmlToMarkdown(outline?.body)
    if (text) leading.push(text)
  }
  // No description and no outline either (e.g. units with only a video and its
  // "Read More" transcript): open with the transcript's first sentences rather
  // than the stock "Let's begin this unit" line.
  if (leading.length === 0 && !htmlToMarkdown(unit.description)) {
    const transcript = blocks.find((b) => b.type === 'text' && textRoleOf(b.title) === 'transcript')
    const plain = htmlToMarkdown(transcript?.body).replace(/^#{1,6}\s*/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ')
    const opening = firstSentences(plain, 2, 320)
    if (opening) leading.push(opening)
  }

  let outcomes: string[] = []
  const introduction: string[] = []
  for (const text of leading) {
    const items = listItems(text)
    if (outcomes.length === 0 && items.length > 0 && OUTCOMES_HEADING.test(text)) outcomes = items
    else introduction.push(text)
  }

  const title = clean(unit.title)
  const description = htmlToMarkdown(unit.description)
  // Units often repeat their description as the first text block.
  const same = (a: string, b: string) =>
    a.replace(/\W+/g, ' ').trim().toLowerCase() === b.replace(/\W+/g, ' ').trim().toLowerCase()
  const intro = introduction.filter((text) => !description || !same(text, description)).join('\n\n')
  const t = await translator(lang, [title, description, intro, ...outcomes])
  return {
    unitId,
    title: t(title),
    description: description ? t(description) : '',
    introduction: intro ? t(intro) : '',
    outcomes: outcomes.map(t),
  }
}

export interface VideoCard {
  learningBlockId: string
  unitId: string
  title: string
  videoUrl: string
  /**
   * A one-question check on this video: the first graded multiple-choice
   * question placed after it in the unit. Never carries the answer.
   */
  check: { questionId: string; text: string; options: string[]; answered: number | null } | null
}

/** The graded multiple-choice question that follows a video in its unit, if any. */
async function videoCheckOf(unitId: string, videoOrder: number) {
  const rows = await db
    .select({
      questionId: blockQuestions.id,
      prompt: blockQuestions.prompt,
      options: blockQuestions.options,
      correctIndex: blockQuestions.correctIndex,
      blockOrder: learningBlocks.order,
    })
    .from(blockQuestions)
    .innerJoin(learningBlocks, eq(learningBlocks.id, blockQuestions.blockId))
    .where(
      and(
        eq(learningBlocks.unitId, unitId),
        eq(learningBlocks.type, 'question'),
        eq(blockQuestions.format, 'multiple-choice'),
        eq(blockQuestions.kind, 'survey'),
      ),
    )
    .orderBy(asc(learningBlocks.order), asc(blockQuestions.order))
  return rows.find((r) => r.blockOrder > videoOrder && r.correctIndex !== null && (r.options?.length ?? 0) >= 2) ?? null
}

export async function getVideo(userId: string, learningBlockId: string, lang: LearnerLanguage): Promise<VideoCard> {
  const [block] = await db
    .select({
      id: learningBlocks.id,
      unitId: learningBlocks.unitId,
      type: learningBlocks.type,
      title: learningBlocks.title,
      videoUrl: learningBlocks.videoUrl,
      order: learningBlocks.order,
    })
    .from(learningBlocks)
    .where(eq(learningBlocks.id, learningBlockId))
    .limit(1)
  if (!block || block.type !== 'video' || !block.videoUrl) throw new AppError('Video not found', 404, 'VIDEO_NOT_FOUND')
  await assertUnitAccess(userId, block.unitId)
  // Many AI Amplify video blocks are titled literally "Video"; the unit name reads better.
  let title = clean(block.title)
  if (!title || /^video$/i.test(title)) {
    const [unit] = await db.select({ title: units.title }).from(units).where(eq(units.id, block.unitId)).limit(1)
    title = clean(unit?.title) || title
  }
  const q = await videoCheckOf(block.unitId, block.order)
  const options = (q?.options ?? []).map((o) => clean(o))
  const t = await translator(lang, [title, ...(q ? [clean(q.prompt), ...options] : [])])
  let check: VideoCard['check'] = null
  if (q) {
    const [saved] = await db
      .select({ answerData: questionAnswers.answerData })
      .from(questionAnswers)
      .where(and(eq(questionAnswers.userId, userId), eq(questionAnswers.questionId, q.questionId)))
      .limit(1)
    const picked = saved?.answerData?.selectedAnswer
    check = {
      questionId: q.questionId,
      text: t(clean(q.prompt)),
      options: options.map((o) => t(o)),
      answered: typeof picked === 'number' ? picked : null,
    }
  }
  return { learningBlockId: block.id, unitId: block.unitId, title: t(title), videoUrl: block.videoUrl, check }
}

/**
 * Saves the learner's answer to a video's check question and says whether it
 * was right. The answer is shown after answering, so it can be returned here.
 */
export async function answerVideoCheck(
  userId: string,
  questionId: string,
  selectedIndex: number,
): Promise<{ correct: boolean; correctIndex: number }> {
  const [q] = await db
    .select({ unitId: learningBlocks.unitId, correctIndex: blockQuestions.correctIndex, options: blockQuestions.options })
    .from(blockQuestions)
    .innerJoin(learningBlocks, eq(learningBlocks.id, blockQuestions.blockId))
    .where(and(eq(blockQuestions.id, questionId), eq(blockQuestions.format, 'multiple-choice')))
    .limit(1)
  if (!q || q.correctIndex === null) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND')
  await assertUnitAccess(userId, q.unitId)
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= (q.options?.length ?? 0)) {
    throw new AppError('Pick one of the options', 400, 'VALIDATION_FAILED')
  }
  await saveQuestionAnswer(userId, questionId, { selectedAnswer: selectedIndex })
  return { correct: selectedIndex === q.correctIndex, correctIndex: q.correctIndex }
}

/**
 * Clears the learner's progress in one course so it can be taken again from
 * the start: lesson progress, saved answers and pre-test / exam attempts.
 * Certificates already issued stay (they are a record).
 */
export async function resetCourseProgress(userId: string, courseId: string): Promise<{ ok: true }> {
  await assertCourseAccess(userId, courseId)
  const moduleIds = (await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId))).map((m) => m.id)
  const unitIds = moduleIds.length
    ? (await db.select({ id: units.id }).from(units).where(inArray(units.moduleId, moduleIds))).map((u) => u.id)
    : []
  const blockIds = unitIds.length
    ? (await db.select({ id: learningBlocks.id }).from(learningBlocks).where(inArray(learningBlocks.unitId, unitIds))).map((b) => b.id)
    : []
  const questionIds = blockIds.length
    ? (await db.select({ id: blockQuestions.id }).from(blockQuestions).where(inArray(blockQuestions.blockId, blockIds))).map((q) => q.id)
    : []
  const assessmentIds = (await db.select({ id: assessments.id }).from(assessments).where(eq(assessments.courseId, courseId))).map((a) => a.id)

  await db.transaction(async (tx) => {
    if (blockIds.length) {
      await tx.delete(userLearningBlockProgress).where(
        and(eq(userLearningBlockProgress.userId, userId), inArray(userLearningBlockProgress.learningBlockId, blockIds)),
      )
    }
    if (questionIds.length) {
      await tx.delete(questionAnswers).where(and(eq(questionAnswers.userId, userId), inArray(questionAnswers.questionId, questionIds)))
    }
    if (unitIds.length) {
      await tx.delete(userUnitProgress).where(and(eq(userUnitProgress.userId, userId), inArray(userUnitProgress.unitId, unitIds)))
    }
    if (moduleIds.length) {
      await tx.delete(userModuleProgress).where(and(eq(userModuleProgress.userId, userId), inArray(userModuleProgress.moduleId, moduleIds)))
    }
    await tx.delete(userCourseProgress).where(and(eq(userCourseProgress.userId, userId), eq(userCourseProgress.courseId, courseId)))
    if (assessmentIds.length) {
      await tx.delete(assessmentAttempts).where(
        and(eq(assessmentAttempts.userId, userId), inArray(assessmentAttempts.assessmentId, assessmentIds)),
      )
    }
  })
  return { ok: true }
}

/** Quizzes the tutor runs: any pre-test, and a graded final exam. */
function isTutorQuiz(a: { isGraded: boolean; assessmentType: string }): boolean {
  return a.assessmentType === 'pre' || (a.assessmentType === 'post' && a.isGraded)
}

export interface QuizCard {
  assessmentId: string
  courseId: string
  /** A pre-test has no pass mark: any attempt is the learner's starting point. */
  kind: 'pre' | 'final'
  title: string
  description: string
  passingScore: number
  /** 0 means unlimited. */
  maxAttempts: number
  attemptsUsed: number
  passed: boolean
  questions: Array<{ questionId: string; text: string; options: string[] }>
}

/** A course's pre-test or final exam: questions and options, never answers. */
export async function getQuiz(userId: string, assessmentId: string, lang: LearnerLanguage): Promise<QuizCard> {
  const [assessment] = await db
    .select({
      id: assessments.id,
      courseId: assessments.courseId,
      title: assessments.title,
      description: assessments.description,
      passingScore: assessments.passingScore,
      maxAttempts: assessments.maxAttempts,
      isGraded: assessments.isGraded,
      assessmentType: assessments.assessmentType,
    })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1)
  if (!assessment || !isTutorQuiz(assessment)) {
    throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')
  }
  await assertCourseAccess(userId, assessment.courseId)

  const rows = await db
    .select({
      id: assessmentQuestions.id,
      text: assessmentQuestions.questionText,
      options: assessmentQuestions.options,
    })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.order))
  if (rows.length === 0) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')

  const attempts = await db
    .select({ passed: assessmentAttempts.passed })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessmentId)))

  // Options stay in their stored order: grading is by position.
  const items = rows.map((q) => ({
    questionId: q.id,
    text: clean(q.text),
    options: (q.options ?? []).map((o) => clean(o)),
  }))
  const title = clean(assessment.title)
  const description = htmlToMarkdown(assessment.description)
  const t = await translator(lang, [title, description, ...items.flatMap((q) => [q.text, ...q.options])])

  return {
    assessmentId,
    courseId: assessment.courseId,
    kind: assessment.assessmentType === 'pre' ? 'pre' : 'final',
    title: t(title),
    description: description ? t(description) : '',
    passingScore: assessment.passingScore,
    maxAttempts: assessment.maxAttempts,
    attemptsUsed: attempts.length,
    // A "take once" pre-test has no pass mark: any attempt completes it.
    passed: !assessment.isGraded ? attempts.length > 0 : attempts.some((a) => a.passed === true),
    questions: items.map((q) => ({ questionId: q.questionId, text: t(q.text), options: q.options.map(t) })),
  }
}

// ---------------------------------------------------------------------------
// Material for the model (load_unit)
// ---------------------------------------------------------------------------

/**
 * A unit's teaching material in English, for Anna to summarise and to answer
 * questions from. Text blocks carry their editorial role — "Read More" is the
 * video's narration, so it is attached to the video as its transcript rather
 * than listed as a reading of its own. Exam questions are deliberately
 * absent: she never needs them, and giving them to her invites hints.
 */
export async function getUnitMaterial(userId: string, unitId: string) {
  await assertUnitAccess(userId, unitId)
  const { unit, blocks } = await unitWithBlocks(unitId)
  // Only fold the narration into a video that exists; a no-video unit keeps
  // its "Read More" as an ordinary reading so the content is not lost.
  const hasVideo = blocks.some((b) => b.type === 'video')
  const transcriptBlock = hasVideo
    ? blocks.find((b) => b.type === 'text' && textRoleOf(b.title) === 'transcript')
    : undefined
  const transcript = htmlToMarkdown(transcriptBlock?.body ?? transcriptBlock?.transcript).slice(0, 6000)
  return {
    unitId,
    title: clean(unit.title),
    description: htmlToMarkdown(unit.description),
    blocks: blocks
      .filter((b) => b.type === 'text' || b.type === 'video')
      .filter((b) => b.id !== transcriptBlock?.id)
      .map((b) =>
        b.type === 'video'
          ? {
              learningBlockId: b.id,
              type: 'video' as const,
              title: clean(b.title),
              ...(transcript
                ? { transcript }
                : b.transcript
                  ? { transcript: htmlToMarkdown(b.transcript).slice(0, 6000) }
                  : {}),
            }
          : {
              learningBlockId: b.id,
              type: 'text' as const,
              role: textRoleOf(b.title),
              text: htmlToMarkdown(b.body),
            },
      ),
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Mark learning blocks complete (intro text, a watched video, summarised reading). */
export async function completeBlocks(userId: string, blockIds: string[]): Promise<void> {
  const ids = [...new Set(blockIds.filter((id) => typeof id === 'string' && id.trim()))]
  if (ids.length === 0) return
  const rows = await db
    .select({ id: learningBlocks.id, unitId: learningBlocks.unitId, type: learningBlocks.type })
    .from(learningBlocks)
    .where(inArray(learningBlocks.id, ids))
  if (rows.length !== ids.length) throw new AppError('Learning block not found', 404, 'BLOCK_NOT_FOUND')
  // Question blocks complete through their answers (submitActionPlan, or the
  // surveys auto-completing), never by being named here.
  if (rows.some((r) => r.type === 'question')) throw new AppError('Answer the questions first', 409, 'BLOCK_NOT_ANSWERED')
  const unitIds = new Set(rows.map((r) => r.unitId))
  for (const unitId of unitIds) await assertUnitAccess(userId, unitId)

  for (const id of ids) await updateBlockProgress(userId, id, 'completed')
  for (const unitId of unitIds) await autoCompleteSurveys(userId, unitId)
}

/**
 * The unit's self-check survey blocks ("«Course» complete unit N" — Yes/No
 * questions with no answer keys) auto-complete once every other block in the
 * unit is done. They are the only classic blocks the tutor never shows, and
 * leaving them incomplete would hold the unit, the course progress and the
 * certificate below 100% forever.
 */
async function autoCompleteSurveys(userId: string, unitId: string): Promise<void> {
  const blocks = await db
    .select({ id: learningBlocks.id, type: learningBlocks.type })
    .from(learningBlocks)
    .where(eq(learningBlocks.unitId, unitId))
  const qIds = blocks.filter((b) => b.type === 'question').map((b) => b.id)
  if (qIds.length === 0) return
  const kinds = await db
    .select({ blockId: blockQuestions.blockId, kind: blockQuestions.kind })
    .from(blockQuestions)
    .where(inArray(blockQuestions.blockId, qIds))
  const actionPlanIds = new Set(kinds.filter((k) => k.kind === 'action-plan').map((k) => k.blockId))
  const surveyIds = qIds.filter((id) => !actionPlanIds.has(id))
  if (surveyIds.length === 0) return

  const progress = await db
    .select({ id: userLearningBlockProgress.learningBlockId, status: userLearningBlockProgress.status })
    .from(userLearningBlockProgress)
    .where(
      and(
        eq(userLearningBlockProgress.userId, userId),
        inArray(
          userLearningBlockProgress.learningBlockId,
          blocks.map((b) => b.id),
        ),
      ),
    )
  const completed = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.id))
  const surveySet = new Set(surveyIds)
  const othersDone = blocks.every((b) => surveySet.has(b.id) || completed.has(b.id))
  if (!othersDone) return
  for (const id of surveyIds) {
    if (!completed.has(id)) await updateBlockProgress(userId, id, 'completed')
  }
}

// ---------------------------------------------------------------------------
// Action plan
// ---------------------------------------------------------------------------

export interface ActionPlanCard {
  learningBlockId: string
  unitId: string
  title: string
  prompts: Array<{ questionId: string; prompt: string; placeholder: string | null; answer: string | null }>
  done: boolean
}

async function actionPlanBlockOf(learningBlockId: string) {
  const [block] = await db
    .select({ id: learningBlocks.id, unitId: learningBlocks.unitId, type: learningBlocks.type })
    .from(learningBlocks)
    .where(eq(learningBlocks.id, learningBlockId))
    .limit(1)
  if (!block || block.type !== 'question') throw new AppError('Action plan not found', 404, 'ACTION_PLAN_NOT_FOUND')
  const prompts = await db
    .select({
      id: blockQuestions.id,
      kind: blockQuestions.kind,
      prompt: blockQuestions.prompt,
      placeholder: blockQuestions.placeholder,
    })
    .from(blockQuestions)
    .where(eq(blockQuestions.blockId, learningBlockId))
    .orderBy(asc(blockQuestions.order))
  if (prompts.length === 0 || !prompts.every((p) => p.kind === 'action-plan')) {
    throw new AppError('Action plan not found', 404, 'ACTION_PLAN_NOT_FOUND')
  }
  return { block, prompts }
}

/** The unit's action-plan prompts, with whatever the learner has saved before. */
export async function getActionPlan(userId: string, learningBlockId: string, lang: LearnerLanguage): Promise<ActionPlanCard> {
  const { block, prompts } = await actionPlanBlockOf(learningBlockId)
  await assertUnitAccess(userId, block.unitId)
  const [unit] = await db.select({ title: units.title }).from(units).where(eq(units.id, block.unitId)).limit(1)

  const saved = await db
    .select({ questionId: questionAnswers.questionId, answerData: questionAnswers.answerData })
    .from(questionAnswers)
    .where(
      and(
        eq(questionAnswers.userId, userId),
        inArray(
          questionAnswers.questionId,
          prompts.map((p) => p.id),
        ),
      ),
    )
  const answerOf = new Map(
    saved.map((s) => [s.questionId, (s.answerData as { openEndedAnswer?: string } | null)?.openEndedAnswer ?? null]),
  )

  const [progress] = await db
    .select({ status: userLearningBlockProgress.status })
    .from(userLearningBlockProgress)
    .where(
      and(eq(userLearningBlockProgress.userId, userId), eq(userLearningBlockProgress.learningBlockId, learningBlockId)),
    )
    .limit(1)

  const title = clean(unit?.title)
  const t = await translator(lang, [title, ...prompts.flatMap((p) => [p.prompt, p.placeholder])])
  return {
    learningBlockId,
    unitId: block.unitId,
    title: t(title),
    prompts: prompts.map((p) => ({
      questionId: p.id,
      prompt: t(clean(p.prompt)),
      placeholder: p.placeholder ? t(clean(p.placeholder)) : null,
      answer: answerOf.get(p.id) ?? null,
    })),
    done: progress?.status === 'completed',
  }
}

/**
 * Save the learner's action plan (same question_answers store the classic
 * course page writes), mark the block complete and let the unit's survey
 * auto-complete behind it.
 */
export async function submitActionPlan(
  userId: string,
  learningBlockId: string,
  answers: Array<{ questionId?: unknown; text?: unknown }>,
): Promise<{ done: true }> {
  const { block, prompts } = await actionPlanBlockOf(learningBlockId)
  await assertUnitAccess(userId, block.unitId)

  const textOf = new Map<string, string>()
  for (const a of answers) {
    if (typeof a?.questionId === 'string' && typeof a?.text === 'string') {
      textOf.set(a.questionId, a.text.trim())
    }
  }
  for (const p of prompts) {
    const text = textOf.get(p.id)
    if (!text || text.length === 0) throw new AppError('Every prompt needs an answer', 400, 'ACTION_PLAN_INCOMPLETE')
    if (text.length > 4000) throw new AppError('An answer is too long', 400, 'ACTION_PLAN_TOO_LONG')
  }

  for (const p of prompts) {
    await saveQuestionAnswer(userId, p.id, { openEndedAnswer: textOf.get(p.id)! })
  }
  await updateBlockProgress(userId, learningBlockId, 'completed')
  await autoCompleteSurveys(userId, block.unitId)
  return { done: true }
}

export interface QuizSubmission {
  assessmentId: string
  kind: 'pre' | 'final'
  score: number
  passed: boolean
  passingScore: number
  correctCount: number
  gradedCount: number
  attemptsUsed: number
  /** 0 means unlimited. */
  maxAttempts: number
  canRetake: boolean
}

/**
 * Grade a pre-test or the final exam and record the attempt via the classic assessment
 * pipeline (shared attempts with the course page; course progress and
 * certificate issue automatically). The learner's browser never sends a
 * score or a pass/fail of its own.
 */
export async function submitQuiz(
  userId: string,
  assessmentId: string,
  answers: Array<{ questionId?: unknown; selectedIndex?: unknown }>,
): Promise<QuizSubmission> {
  const [assessment] = await db
    .select({
      courseId: assessments.courseId,
      isGraded: assessments.isGraded,
      assessmentType: assessments.assessmentType,
    })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1)
  if (!assessment || !isTutorQuiz(assessment)) {
    throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')
  }
  await assertCourseAccess(userId, assessment.courseId)

  const before = await db
    .select({ passed: assessmentAttempts.passed })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessmentId)))
  if (before.some((a) => a.passed === true)) {
    throw new AppError('This exam has already been passed', 409, 'QUIZ_ALREADY_PASSED')
  }

  const map: Record<string, number> = {}
  for (const a of answers) {
    if (typeof a?.questionId === 'string' && Number.isInteger(Number(a.selectedIndex))) {
      map[a.questionId] = Number(a.selectedIndex)
    }
  }

  let summary: Awaited<ReturnType<typeof submitAttempt>>
  try {
    summary = await submitAttempt(userId, assessmentId, map)
  } catch (error) {
    if (error instanceof Error && error.message === 'MAX_ATTEMPTS_EXCEEDED') {
      throw new AppError('No attempts left for this exam', 409, 'QUIZ_LOCKED')
    }
    throw error
  }

  const score = summary.latestAttempt?.score ?? 0
  const passed = !assessment.isGraded || summary.latestAttempt?.passed === true
  const total = summary.assessment.totalQuestions
  return {
    assessmentId,
    kind: assessment.assessmentType === 'pre' ? 'pre' : 'final',
    score,
    passed,
    passingScore: summary.assessment.passingScore,
    correctCount: Math.round((score / 100) * total),
    gradedCount: total,
    attemptsUsed: summary.attemptsMade,
    maxAttempts: summary.assessment.maxAttempts,
    canRetake: !passed && summary.canStartAssessment,
  }
}

/** Who is learning — what the page sends the agent as __tutor_learner__. */
export async function getLearnerProfile(userId: string) {
  const [row] = await db
    .select({ fullName: users.fullName, company: users.company, country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  return {
    firstName: (row.fullName ?? '').split(' ')[0] || 'there',
    fullName: row.fullName,
    company: row.company ?? null,
    country: row.country ?? null,
  }
}
