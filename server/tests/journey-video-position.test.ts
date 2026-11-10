import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  codUserPaths,
  codContentPool,
  codPathContentRefs,
  codUserQuizResults,
  bothUserPaths,
  bothContentPool,
  bothPathContentRefs,
  bothUserQuizResults,
} from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Video resume in Content on Demand and Blended: the position is saved against
 * the learner's own path item, never someone else's or one outside their path,
 * and watched % only goes up.
 */

let learner: TestUser
let other: TestUser
let codPathId: string
let bothPathId: string
let contentId: string
let bothItemId: string
const milestones = [{ milestoneId: 'm1', title: 'One', rationale: 'fixture', order: 1 }]
const pretestDone = { milestoneId: 'm1', quizType: 'pretest' as const, score: 0, totalQuestions: 0, passed: true, attemptNumber: 1 }

type Saved = { success: boolean; data: { videoPositionSec: number; videoWatchPct: number } }

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('jvp')
  other = await createTestUser('jvp-other')
  ;[{ id: codPathId }] = await db.insert(codUserPaths).values({ userId: learner.id, milestones }).returning({ id: codUserPaths.id })
  ;[{ id: bothPathId }] = await db.insert(bothUserPaths).values({ userId: learner.id, milestones }).returning({ id: bothUserPaths.id })
  ;[{ id: contentId }] = await db
    .insert(codContentPool)
    .values({ url: `https://www.youtube.com/watch?v=jvp${Date.now()}`, type: 'youtube', title: 'UAT video', sourceQuery: 'test' })
    .returning({ id: codContentPool.id })
  ;[{ id: bothItemId }] = await db
    .insert(bothContentPool)
    .values({ url: `https://www.youtube.com/watch?v=jvpb${Date.now()}`, type: 'youtube', title: 'UAT video', sourceQuery: 'test' })
    .returning({ id: bothContentPool.id })
  // Each video sits in the open first milestone of the learner's path, pre-test done.
  await db.insert(codPathContentRefs).values({ codUserPathId: codPathId, contentPoolId: contentId, milestoneId: 'm1' })
  await db.insert(bothPathContentRefs).values({ bothUserPathId: bothPathId, contentPoolId: bothItemId, milestoneId: 'm1' })
  await db.insert(codUserQuizResults).values({ userId: learner.id, codUserPathId: codPathId, ...pretestDone })
  await db.insert(bothUserQuizResults).values({ userId: learner.id, bothUserPathId: bothPathId, ...pretestDone })
})

afterAll(async () => {
  await db.delete(codContentPool).where(eq(codContentPool.id, contentId))
  await db.delete(bothContentPool).where(eq(bothContentPool.id, bothItemId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('Content on Demand video position', () => {
  const save = (body: object, token = learner.token) =>
    api<Saved>('PUT', `/api/lms/cod/content/${contentId}/video-position`, { token, body })

  it('saves position and watched %', async () => {
    const res = await save({ pathId: codPathId, positionSec: 75, watchPct: 40 })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ videoPositionSec: 75, videoWatchPct: 40 })
  })
  it('never lowers watched %', async () => {
    expect((await save({ pathId: codPathId, positionSec: 10, watchPct: 5 })).body.data).toEqual({ videoPositionSec: 10, videoWatchPct: 40 })
  })
  it("refuses someone else's path", async () => {
    expect((await save({ pathId: codPathId, positionSec: 5, watchPct: 5 }, other.token)).status).toBe(404)
  })
  it('refuses an item outside the learner\'s path', async () => {
    const res = await api<Saved>('PUT', `/api/lms/cod/content/${crypto.randomUUID()}/video-position`, {
      token: learner.token, body: { pathId: codPathId, positionSec: 5, watchPct: 5 },
    })
    expect(res.status).toBe(404)
  })
  it('validates its input', async () => {
    expect((await save({ pathId: codPathId, positionSec: -3, watchPct: 5 })).status).toBe(422)
  })
})

describe('Blended video position', () => {
  const save = (body: object, token = learner.token, itemId = bothItemId) =>
    api<Saved>('PUT', `/api/lms/both/items/${itemId}/video-position`, { token, body })
  const base = { itemType: 'external', milestoneId: 'm1' }

  it('saves position and watched %', async () => {
    const res = await save({ ...base, pathId: bothPathId, positionSec: 30, watchPct: 25 })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ videoPositionSec: 30, videoWatchPct: 25 })
  })
  it('never lowers watched %', async () => {
    expect((await save({ ...base, pathId: bothPathId, positionSec: 2, watchPct: 3 })).body.data).toEqual({ videoPositionSec: 2, videoWatchPct: 25 })
  })
  it("refuses someone else's path", async () => {
    expect((await save({ ...base, pathId: bothPathId, positionSec: 5, watchPct: 5 }, other.token)).status).toBe(404)
  })
  it('refuses an item outside the learner\'s path', async () => {
    expect((await save({ ...base, pathId: bothPathId, positionSec: 5, watchPct: 5 }, learner.token, crypto.randomUUID())).status).toBe(404)
  })
  it('needs a signed-in learner', async () => {
    expect((await save({ ...base, pathId: bothPathId, positionSec: 5, watchPct: 5 }, '')).status).toBe(401)
  })
})
