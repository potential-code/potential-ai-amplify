import { Agent } from 'undici'
import jwt from 'jsonwebtoken'
import { AppError } from '../../utils/app-error'

// COD path builder can take up to 10 min (20–30 LLM calls on local Ollama); use a generous timeout.
const aiDispatcher = new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 })

function getAiBaseUrl(): string {
  const base = process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  if (!base) throw new AppError('AI backend is not configured', 503, 'AI_NOT_CONFIGURED')
  return base.replace(/\/$/, '')
}

function mintServiceToken(userId: string): string {
  const secret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!secret) throw new AppError('AI backend is not configured', 503, 'AI_NOT_CONFIGURED')
  return jwt.sign({ platformId: 'smeep', userId }, secret, { algorithm: 'HS256', expiresIn: 300 })
}

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

export interface CodPathBuilderInput {
  profile: {
    goals: string
    topics: string[]
    experienceLevel: string
    learningStyle: string
    milestoneCount: number
  }
}

export interface CodPathBuilderOutput {
  milestones: Array<{ milestoneId: string; title: string; order: number; rationale: string }>
  contentRefs: Array<{
    contentItem: {
      url: string; type: 'youtube' | 'article'; title: string; description: string
      sourceQuery: string; youtubeVideoId?: string; channelTitle?: string
      durationSeconds?: number; articleText?: string; qualityScore: number
    }
    milestoneId: string; orderInMilestone: number; rationale: string
  }>
  assessments: Array<{
    milestoneId: string; milestoneTitle: string
    pretestQuestions: Array<{ question: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string }>
    questions: Array<{ question: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string }>
  }>
  verificationResult: { approved: boolean; issues: string[] }
}

export function callCodPathBuilder(userId: string, input: CodPathBuilderInput): Promise<CodPathBuilderOutput> {
  return postToAi<CodPathBuilderOutput>('/api/cod/path', userId, input)
}
