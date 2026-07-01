export interface BothDiscoveryProfile {
  goals: string
  topics: string[]
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'
  learningStyle: 'visual' | 'reading' | 'mixed'
  milestoneCount: number
}

export interface BlockQuestion {
  id: string
  prompt: string
  kind: string
  format: string
  options?: string[] | null
  correctIndex?: number | null
  placeholder?: string | null
  order: number
}

export interface BothContentItem {
  id: string
  itemType: 'external' | 'internal'
  orderInMilestone: number
  rationale?: string | null
  title: string
  // external fields
  url?: string | null
  type?: 'youtube' | 'article' | null
  description?: string | null
  youtubeVideoId?: string | null
  durationSeconds?: number | null
  articleText?: string | null
  progress?: { status: string; videoWatchPct: number | null } | null
  // internal block fields
  blockId?: string | null
  blockType?: string | null
  body?: string | null
  videoUrl?: string | null
  imageUrl?: string | null
  transcript?: string | null
  questions?: BlockQuestion[] | null
  blockProgress?: { status: string; videoWatchPct: number | null } | null
}

export interface BothMilestone {
  milestoneId: string
  title: string
  order: number
  rationale: string
  unlocked: boolean
  pretestCompleted: boolean
  hasPretest: boolean
  completed: boolean
  content: BothContentItem[]
  quiz: { score: number; total: number; passed: boolean; attempts: number } | null
  quizAvailable: boolean
}

export interface BothPathResponse {
  path: {
    id: string
    status: 'building' | 'active' | 'completed' | 'failed'
    discoveryProfile: BothDiscoveryProfile
    internalBlockCount: number
  }
  milestones: BothMilestone[]
}

export interface BothAssessment {
  milestoneId: string
  milestoneTitle: string
  questions: Array<{ question: string; options: [string, string, string, string]; explanation: string }>
}

export type BothPretest = BothAssessment
export type BothQuiz = BothAssessment

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/api/lms`

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('smeep_token')
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' })) as { message?: string }
    throw new Error(err.message ?? `Request failed: ${res.status}`)
  }
  const json = await res.json() as { success: boolean; data: T }
  if (!json.success) throw new Error('Request unsuccessful')
  return json.data
}

export async function fetchBothPath(): Promise<BothPathResponse | null> {
  return apiFetch<BothPathResponse | null>('/both/path')
}

export async function generateBothPath(profile: BothDiscoveryProfile): Promise<{ pathId: string }> {
  return apiFetch('/both/path/generate', { method: 'POST', body: JSON.stringify({ profile }) })
}

export async function completeBothItem(
  itemId: string,
  pathId: string,
  itemType: 'external' | 'internal',
  milestoneId: string,
  videoWatchPct?: number,
): Promise<void> {
  await apiFetch(`/both/items/${itemId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ pathId, itemType, milestoneId, videoWatchPct }),
  })
}

export async function fetchBothMilestonePretest(milestoneId: string, pathId: string): Promise<BothPretest> {
  return apiFetch(`/both/milestones/${milestoneId}/pretest?pathId=${pathId}`)
}

export async function submitBothMilestonePretest(
  milestoneId: string,
  pathId: string,
  answers: number[],
): Promise<{ score: number; total: number }> {
  return apiFetch(`/both/milestones/${milestoneId}/pretest/submit`, {
    method: 'POST',
    body: JSON.stringify({ pathId, answers }),
  })
}

export async function fetchBothMilestoneQuiz(milestoneId: string, pathId: string): Promise<BothQuiz> {
  return apiFetch(`/both/milestones/${milestoneId}/quiz?pathId=${pathId}`)
}

export async function submitBothMilestoneQuiz(
  milestoneId: string,
  pathId: string,
  answers: number[],
): Promise<{ score: number; total: number; passed: boolean }> {
  return apiFetch(`/both/milestones/${milestoneId}/quiz/submit`, {
    method: 'POST',
    body: JSON.stringify({ pathId, answers }),
  })
}
