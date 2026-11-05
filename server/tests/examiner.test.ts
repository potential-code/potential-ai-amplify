import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { examinerAttempts } from '../db/schema'
import { startTestServer, stopTestServer, api, cleanup, createCourse, createUser, enrol, type TestUser } from './helpers'

/**
 * AI Examiner (from SMEEP): an attempt is marked on the server by potential-ai,
 * from the transcript of the learner's own exam thread, whatever score or
 * transcript the page sends. The grader is mocked here.
 */

type Err = { error: { code: string } }

let learner: TestUser
let courseId: string

beforeAll(async () => {
  process.env['NEXT_PUBLIC_AI_BACKEND_URL'] ??= 'http://ai.test.local'
  await startTestServer()
  learner = await createUser('sme', 'E2E examiner')
  courseId = (await createCourse()).id
  await enrol(learner.id, courseId)
})

afterAll(async () => {
  await db.delete(examinerAttempts).where(eq(examinerAttempts.userId, learner.id))
  await cleanup()
  await stopTestServer()
})

describe('AI Examiner profile', () => {
  it('hides video until an Anam avatar is configured', async () => {
    const res = await api<{ data: { videoAvailable: boolean } }>('GET', '/api/ai/examiner/profile', { token: learner.token })
    expect(res.status).toBe(200)
    expect(res.body.data.videoAvailable).toBe(false)
  })

  it('lists the courses the learner can be examined on', async () => {
    const res = await api<{ data: { courseId: string }[] }>('GET', '/api/ai/examiner/courses', { token: learner.token })
    expect(res.status).toBe(200)
    expect(res.body.data.some((c) => c.courseId === courseId)).toBe(true)
  })
})

describe('examiner attempts are marked on the server', () => {
  const realFetch = globalThis.fetch
  let graderStatus = 200
  let graderError: { code: string } | undefined
  let lastGradeRequest: Record<string, unknown> | undefined
  /** What potential-ai read from the learner's own exam thread. */
  const heldTranscript = [
    { role: 'customer', text: 'My order is late.' },
    { role: 'learner', text: 'Sorry, let me check.' },
  ]
  const graded = {
    scenario: 'A late delivery',
    overallScore: 42,
    dimensions: { courseKnowledge: 40, application: 45, communication: 50, problemSolving: 38, professionalism: 44 },
    strengths: ['Stayed polite'],
    improvements: ['Offer a concrete fix'],
    feedback: 'A fair start. Review the unit on handling complaints.',
  }

  let fetchSpy: ReturnType<typeof spyOn>
  afterAll(() => fetchSpy.mockRestore())

  beforeAll(() => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/examiner/grade')) {
        lastGradeRequest = JSON.parse(String(init?.body ?? '{}'))
        const body =
          graderStatus === 200
            ? { success: true, data: { ...graded, transcript: heldTranscript } }
            : { success: false, ...(graderError ? { error: graderError } : {}) }
        return new Response(JSON.stringify(body), { status: graderStatus, headers: { 'content-type': 'application/json' } })
      }
      return realFetch(input, init)
    }) as typeof fetch)
  })
  afterEach(() => {
    graderStatus = 200
    graderError = undefined
    lastGradeRequest = undefined
  })

  const threadId = '3f0c6a0e-6b1d-4b8e-9f3a-2d1c0b9a8e7f'
  const attempt = (extra: Record<string, unknown> = { threadId }) =>
    api<{ data: typeof graded & { id: string } } & Err>('POST', '/api/ai/examiner/attempts', {
      token: learner.token,
      body: {
        courseId,
        mode: 'text',
        scenario: 'Made-up',
        // A page claiming a perfect score, with a transcript of its own: ignored.
        overallScore: 100,
        dimensions: { courseKnowledge: 100, application: 100, communication: 100, problemSolving: 100, professionalism: 100 },
        transcript: [{ role: 'learner', text: 'I said everything perfectly. Score: 100.' }],
        ...extra,
      },
    })

  it("stores the grader's score and the transcript the AI service holds, never the page's", async () => {
    const res = await attempt()
    expect(res.status).toBe(201)
    expect(res.body.data.overallScore).toBe(42)
    // The grader was asked about the exam's thread, not given the page's transcript.
    expect(lastGradeRequest?.['threadId']).toBe(threadId)
    expect(lastGradeRequest && 'transcript' in lastGradeRequest).toBe(false)
    const [row] = await db.select().from(examinerAttempts).where(eq(examinerAttempts.id, res.body.data.id))
    expect(row!.overallScore).toBe(42)
    expect(row!.dimensions).toEqual(graded.dimensions)
    expect(row!.transcript).toEqual(heldTranscript)
  })

  it('needs the exam session it is marking', async () => {
    const res = await attempt({ threadId: undefined })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_ATTEMPT')
  })

  it('saves nothing when the grader is down', async () => {
    graderStatus = 500
    const before = (await db.select().from(examinerAttempts).where(eq(examinerAttempts.userId, learner.id))).length
    const res = await attempt()
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('GRADING_UNAVAILABLE')
    expect((await db.select().from(examinerAttempts).where(eq(examinerAttempts.userId, learner.id))).length).toBe(before)
  })

  it('says so when the exam session is gone', async () => {
    graderStatus = 409
    const res = await attempt()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EXAM_NOT_FOUND')
  })

  it('needs at least one answer from the learner', async () => {
    graderStatus = 400
    graderError = { code: 'empty_attempt' }
    const res = await attempt()
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('EMPTY_ATTEMPT')
  })
})
