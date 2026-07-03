import { Agent } from 'undici'
import jwt from 'jsonwebtoken'
import { AppError } from '../../utils/app-error'

// Both path builder can take up to 7 min (extra selectInternalBlocks step adds LLM calls).
const aiDispatcher = new Agent({ headersTimeout: 420_000, bodyTimeout: 420_000 })

function getAiBaseUrl(): string {
  const base = process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  if (!base) throw new AppError('AI backend is not configured', 503, 'AI_NOT_CONFIGURED')
  return base.replace(/\/$/, '')
}

function mintServiceToken(userId: string): string {
  const secret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!secret) throw new AppError('AI backend is not configured', 503, 'AI_NOT_CONFIGURED')
  return jwt.sign({ platformId: 'ai-amplify', userId }, secret, { algorithm: 'HS256', expiresIn: 300 })
}

/**
 * Generic POST helper for the AI backend. Mints a short-lived service JWT and
 * sends the request body as JSON. Parses the standard `{ success, data }` envelope.
 *
 * @param path   - Absolute path on the AI backend (e.g. `/api/both/path`).
 * @param userId - Requesting user UUID — embedded in the service JWT.
 * @param body   - Serialisable request payload.
 * @returns      - The `data` field from the AI response envelope.
 */
async function postToAi<T>(path: string, userId: string, body: unknown): Promise<T> {
  const token = mintServiceToken(userId)
  let res: globalThis.Response
  try {
    res = await fetch(`${getAiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      dispatcher: aiDispatcher,
    } as RequestInit & { dispatcher?: unknown })
  } catch {
    throw new AppError('Failed to reach AI backend', 502, 'AI_UNREACHABLE')
  }
  if (!res.ok) throw new AppError(`AI backend returned ${res.status}`, 502, 'AI_REQUEST_FAILED')
  const json = (await res.json()) as { success?: boolean; data?: T }
  if (!json.success || json.data === undefined) throw new AppError('AI backend returned an unexpected response', 502, 'AI_BAD_RESPONSE')
  return json.data
}

// ── Input / Output types ──────────────────────────────────────────────────────

/**
 * A single item from the SMEEP block catalog sent to the AI.
 * For video blocks the transcript is included so the AI can make semantic choices.
 */
export interface BlockCatalogItem {
  id: string
  title: string
  type: string
  courseTitle: string
  unitTitle: string
  /** Textual body (text blocks). */
  text?: string | null
  /** Video transcript (video blocks). */
  transcript?: string | null
}

export interface BothPathBuilderInput {
  profile: {
    goals: string
    topics: string[]
    experienceLevel: string
    learningStyle: string
    milestoneCount: number
  }
  /** Full catalog of published SMEEP blocks for the AI to select from. */
  blocks: BlockCatalogItem[]
}

export interface BothPathBuilderOutput {
  milestones: Array<{ milestoneId: string; title: string; order: number; rationale: string }>
  /** External (YouTube / article) content refs chosen by the AI. */
  contentRefs: Array<{
    contentItem: {
      url: string; type: 'youtube' | 'article'; title: string; description: string
      sourceQuery: string; youtubeVideoId?: string; channelTitle?: string
      durationSeconds?: number; articleText?: string; qualityScore: number
    }
    milestoneId: string; orderInMilestone: number; rationale: string
  }>
  /** Internal SMEEP block refs chosen by the AI from the provided catalog. */
  blockRefs: Array<{
    blockId: string; milestoneId: string; orderInMilestone: number; rationale: string
  }>
  assessments: Array<{
    milestoneId: string; milestoneTitle: string
    pretestQuestions: Array<{ question: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string }>
    questions: Array<{ question: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string }>
  }>
  verificationResult: { approved: boolean; issues: string[] }
}

/**
 * Calls the Both path builder on the AI backend.
 * Sends the learner profile AND the full SMEEP block catalog so the AI can
 * interleave internal blocks with externally-sourced content per milestone.
 *
 * @param userId - Learner UUID (embedded in the service JWT for tracing).
 * @param input  - Profile + block catalog.
 * @returns      - Structured output with milestones, content refs, block refs, and assessments.
 */
export function callBothPathBuilder(userId: string, input: BothPathBuilderInput): Promise<BothPathBuilderOutput> {
  return postToAi<BothPathBuilderOutput>('/api/both/path', userId, input)
}
