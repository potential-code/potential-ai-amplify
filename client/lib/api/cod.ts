export interface CodDiscoveryProfile {
  goals: string
  topics: string[]
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'
  learningStyle: 'visual' | 'reading' | 'mixed'
  milestoneCount: number
}

export interface CodContentItem {
  id: string
  url: string
  type: 'youtube' | 'article'
  title: string
  description: string | null
  youtubeVideoId: string | null
  channelTitle: string | null
  durationSeconds: number | null
  articleText: string | null
  status: 'active' | 'unavailable'
  progress: { status: string; videoWatchPct: number; videoPositionSec?: number | null } | null
  orderInMilestone: number
  rationale: string | null
}

export interface CodMilestone {
  milestoneId: string
  title: string
  order: number
  rationale: string
  unlocked: boolean
  pretestCompleted: boolean
  hasPretest: boolean
  completed: boolean
  content: CodContentItem[]
  quiz: { score: number; total: number; passed: boolean; attempts: number } | null
  quizAvailable: boolean
}

export interface CodPathResponse {
  path: { id: string; status: 'building' | 'active' | 'completed' | 'failed'; discoveryProfile: CodDiscoveryProfile }
  milestones: CodMilestone[]
}

export interface CodAssessment {
  milestoneId: string
  milestoneTitle: string
  questions: Array<{ question: string; options: [string, string, string, string] }>
}

export type CodPretest = CodAssessment
export type CodQuiz = CodAssessment

const BASE = `/api/lms`


async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
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

export async function fetchCodPath(): Promise<CodPathResponse | null> {
  return apiFetch<CodPathResponse | null>('/cod/path')
}

export async function generateCodPath(profile: CodDiscoveryProfile): Promise<{ pathId: string }> {
  return apiFetch('/cod/path/generate', { method: 'POST', body: JSON.stringify({ profile }) })
}

/** Saves the video position; keepalive so it also goes out as the page closes. */
export function saveCodVideoPosition(contentId: string, pathId: string, positionSec: number, watchPct: number) {
  return fetch(`${BASE}/cod/content/${contentId}/video-position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ pathId, positionSec, watchPct }),
  }).catch(() => undefined)
}


export async function completeCodContent(contentId: string, pathId: string, videoWatchPct?: number): Promise<void> {
  await apiFetch(`/cod/content/${contentId}/complete`, { method: 'POST', body: JSON.stringify({ pathId, videoWatchPct }) })
}

export async function fetchMilestonePretest(milestoneId: string, pathId: string): Promise<CodPretest> {
  return apiFetch(`/cod/milestones/${milestoneId}/pretest?pathId=${pathId}`)
}

export async function submitMilestonePretest(milestoneId: string, pathId: string, answers: number[]): Promise<{ score: number; total: number }> {
  return apiFetch(`/cod/milestones/${milestoneId}/pretest/submit`, { method: 'POST', body: JSON.stringify({ pathId, answers }) })
}

export async function fetchMilestoneQuiz(milestoneId: string, pathId: string): Promise<CodQuiz> {
  return apiFetch(`/cod/milestones/${milestoneId}/quiz?pathId=${pathId}`)
}

export async function submitMilestoneQuiz(milestoneId: string, pathId: string, answers: number[]): Promise<{ score: number; total: number; passed: boolean }> {
  return apiFetch(`/cod/milestones/${milestoneId}/quiz/submit`, { method: 'POST', body: JSON.stringify({ pathId, answers }) })
}
