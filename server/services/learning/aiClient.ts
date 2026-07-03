import { Agent } from 'undici'
import jwt from 'jsonwebtoken'
import { AppError } from '../../utils/app-error'

// Setup (Graph A) over the full catalogue can take many minutes of gpt-5 work;
// undici's default 300s headers/body timeout aborts the request mid-flight. Use a
// long-lived dispatcher with generous timeouts. Harmless for the fast path call.
const aiDispatcher = new Agent({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000 }) // 30 min

/**
 * AI client for the learning-path subgraph (potential-ai).
 *
 * Both calls authenticate with a short-lived service JWT signed with the shared
 * COPILOT_SERVICE_JWT_SECRET — the same secret/claim shape minted by the auth
 * controller (`{ platformId: 'ai-amplify', userId }`, HS256). The AI service gates
 * these routes by platform; ai-amplify is allowlisted.
 *
 * The AI responses use the standard `{ success, data }` envelope; we unwrap
 * `data` here so callers receive the bare payload.
 */

// ── Wire payload / response types ────────────────────────────────────────────

/** A learning block as sent to Graph A (setup). */
export interface SetupBlock {
  id: string
  title: string
  text: string
  courseId: string
  courseTitle: string
  unitTitle: string
}

/** Optional tuning passed through to the setup graph. */
export type SetupConfig = Record<string, unknown>

/** Graph A response: themes + questionnaire. */
export interface SetupResult {
  themes: Array<{
    tempId: string
    title: string
    description: string
    blockIds: string[]
  }>
  questions: Array<{
    prompt: string
    type: 'single' | 'multi' | 'scale' | 'text'
    options?: string[]
  }>
}

/** A block as sent to Graph B (path), enriched with difficulty/duration. */
export interface PathBlock {
  id: string
  title: string
  type: string
  difficulty: string
  durationMins: number
}

/** A theme (with its blocks) as sent to Graph B. */
export interface PathTheme {
  id: string
  title: string
  description: string | null
  blocks: PathBlock[]
}

/** Flattened questionnaire answer (prompt + answer) sent to Graph B. */
export interface PathQuestionnaireEntry {
  questionId: string
  prompt: string
  answer: unknown
}

/** A learner's existing block progress sent to Graph B. */
export interface PathProgressEntry {
  blockId: string
  status: 'not_started' | 'in_progress' | 'completed'
}

/** Graph B response: ordered milestones over themes/blocks. */
export interface PathResult {
  milestones: Array<{
    themeId: string
    order: number
    rationale: string
    blocks: Array<{ blockId: string; order: number; reason?: string }>
  }>
}

// ── Internals ────────────────────────────────────────────────────────────────

/** Resolves the AI backend base URL, throwing a configured error if missing. */
function getAiBaseUrl(): string {
  const base = process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  if (!base) {
    throw new AppError('AI backend is not configured', 503, 'AI_NOT_CONFIGURED')
  }
  return base.replace(/\/$/, '')
}

/**
 * Mints a short-lived (~5min) service JWT for the AI backend.
 *
 * @param userId - The learner the request is acting on behalf of.
 * @returns A signed HS256 token carrying `{ platformId: 'ai-amplify', userId }`.
 */
function mintServiceToken(userId: string): string {
  const secret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!secret) {
    throw new AppError('AI backend is not configured', 503, 'AI_NOT_CONFIGURED')
  }
  return jwt.sign({ platformId: 'ai-amplify', userId }, secret, {
    algorithm: 'HS256',
    expiresIn: 300, // 5 minutes — long enough for one request round-trip
  })
}

/**
 * POSTs JSON to an AI learning route and unwraps the `{ success, data }` envelope.
 * Throws AppError on non-2xx responses or on an unsuccessful envelope.
 *
 * @param path   - Path under the AI base URL (e.g. '/api/learning/setup').
 * @param userId - Acting learner UUID (used to mint the service token).
 * @param body   - JSON-serialisable request body.
 */
async function postToAi<T>(path: string, userId: string, body: unknown): Promise<T> {
  const token = mintServiceToken(userId)
  let res: globalThis.Response
  try {
    res = await fetch(`${getAiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      // Node's fetch RequestInit type omits `dispatcher`; undici honours it at runtime.
      dispatcher: aiDispatcher,
    } as RequestInit & { dispatcher?: unknown })
  } catch (cause) {
    // Network-level failure (DNS, refused connection, timeout, etc.)
    throw new AppError('Failed to reach AI backend', 502, 'AI_UNREACHABLE')
  }

  if (!res.ok) {
    throw new AppError(`AI backend returned ${res.status}`, 502, 'AI_REQUEST_FAILED')
  }

  const json = (await res.json()) as { success?: boolean; data?: T }
  if (!json.success || json.data === undefined) {
    throw new AppError('AI backend returned an unexpected response', 502, 'AI_BAD_RESPONSE')
  }
  return json.data
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Calls Graph A (setup): turns the full block catalogue into curated themes and
 * a questionnaire. Admin-triggered (regenerate).
 *
 * @param userId - Acting admin UUID (for the service token).
 * @param blocks - Catalogue of published learning blocks.
 * @param config - Optional tuning forwarded to the graph.
 */
export async function callSetup(
  userId: string,
  blocks: SetupBlock[],
  config?: SetupConfig,
): Promise<SetupResult> {
  return postToAi<SetupResult>('/api/learning/setup', userId, { blocks, config })
}

/**
 * Calls Graph B (path): orders themes/blocks into milestones for a single learner
 * based on their questionnaire answers and existing progress.
 *
 * @param userId        - Learner UUID (for the service token).
 * @param questionnaire - Flattened answers (prompt + answer).
 * @param themes        - Candidate themes with their blocks.
 * @param progress      - Optional existing block progress.
 */
export async function callPath(
  userId: string,
  questionnaire: PathQuestionnaireEntry[],
  themes: PathTheme[],
  progress?: PathProgressEntry[],
): Promise<PathResult> {
  return postToAi<PathResult>('/api/learning/path', userId, { questionnaire, themes, progress })
}
