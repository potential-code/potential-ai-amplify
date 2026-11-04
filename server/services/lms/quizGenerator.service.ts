import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { assessments, assessmentQuestions } from '../../db/schema'
import { AppError } from '../../utils/app-error'
import { getCourse } from './courses.service'
import { aiDispatcher, getAiBaseUrl, mintServiceToken } from '../learning/aiClient'

/**
 * Drafts pre-test and final-exam questions from the whole course's own text
 * (potential-ai /api/learning/quiz-generate). Nothing is saved here: the admin
 * picks which drafts to add, and they're created through the normal question
 * endpoints. Only graded assessments get drafts: lesson question blocks are
 * ungraded surveys, where a marked right answer would never be shown.
 */

export type QuizFormat = 'multiple-choice' | 'true-false' | 'mixed'

export interface DraftQuestion {
  format: 'multiple-choice' | 'true-false'
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

/** Lesson HTML as plain text for the question writer: block breaks kept, tags and entities gone. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Below this much text there is nothing to write good questions from. */
const MIN_TEXT = 300
const PER_BLOCK = 4000
const TOTAL = 60_000

type BlockText = { title: string; type: string; body: string | null; transcript: string | null }

function blockText(b: BlockText): string {
  if (b.type === 'text') return htmlToText(b.body).slice(0, PER_BLOCK)
  if (b.type === 'video') return (b.transcript ?? '').trim().slice(0, PER_BLOCK)
  return ''
}

function unitText(u: { title: string; description?: string | null }, blocks: BlockText[]): string {
  const parts = blocks.map((b) => {
    const t = blockText(b)
    return t ? `${b.title ? `### ${b.title}\n` : ''}${t}` : ''
  })
  const body = parts.filter(Boolean).join('\n\n')
  return body ? `## ${u.title}\n${u.description ? `${u.description}\n` : ''}\n${body}` : ''
}

/** Shares the budget across units, so a long first unit can't crowd out the rest. */
function fitText(sections: string[]): string {
  const filled = sections.filter(Boolean)
  if (!filled.length) return ''
  const each = Math.max(2000, Math.floor(TOTAL / filled.length))
  return filled.map((s) => s.slice(0, each)).join('\n\n---\n\n').slice(0, TOTAL)
}

interface Source {
  title: string
  content: string
  purpose: 'pre' | 'post'
  avoid: string[]
}

async function sourceFor(assessmentId: string): Promise<Source> {
  const [a] = await db.select().from(assessments).where(eq(assessments.id, assessmentId))
  if (!a) throw new AppError('Assessment not found', 404, 'NOT_FOUND')
  const course = await getCourse(a.courseId)
  if (!course) throw new AppError('Course not found', 404, 'NOT_FOUND')
  const existing = await db.select({ q: assessmentQuestions.questionText }).from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, a.id))
  const sections = course.modules.flatMap((m) => m.units.map((u) => unitText(u, u.blocks)))
  return {
    title: course.title,
    content: fitText([course.description ? `# ${course.title}\n${course.description}` : '', ...sections]),
    purpose: a.assessmentType,
    avoid: existing.map((e) => e.q),
  }
}

export async function generateQuizDrafts(
  userId: string,
  assessmentId: string,
  opts: { count: number; format: QuizFormat },
): Promise<DraftQuestion[]> {
  const source = await sourceFor(assessmentId)
  if (source.content.length < MIN_TEXT) {
    throw new AppError(
      'There isn’t enough lesson text to write questions from yet. Add text or video transcripts to the units first.',
      422,
      'NOT_ENOUGH_CONTENT',
    )
  }

  const failed = () => new AppError('Questions couldn’t be written right now. Try again in a minute.', 502, 'AI_REQUEST_FAILED')
  let res: globalThis.Response
  try {
    res = await fetch(`${getAiBaseUrl()}/api/learning/quiz-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintServiceToken(userId)}` },
      body: JSON.stringify({ ...source, count: opts.count, format: opts.format }),
      dispatcher: aiDispatcher,
    } as RequestInit & { dispatcher?: unknown })
  } catch {
    throw failed()
  }
  if (!res.ok) throw failed()
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { questions?: DraftQuestion[] } } | null
  const questions = json?.success ? json.data?.questions : undefined
  if (!Array.isArray(questions)) throw failed()
  if (!questions.length) {
    throw new AppError('No questions could be checked against this content. Try again, or add more lesson text.', 422, 'NO_QUESTIONS')
  }
  return questions
}
