import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { codUserPaths, codContentPool, bothUserPaths } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Video resume in Content on Demand and Blended: the position is saved against
 * the learner's own path item, never someone else's, and watched % only goes up.
 */

let learner: TestUser
let other: TestUser
let codPathId: string
let bothPathId: string
let contentId: string

type Saved = { success: boolean; data: { videoPositionSec: number; videoWatchPct: number } }

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('jvp')
  other = await createTestUser('jvp-other')
  ;[{ id: codPathId }] = await db.insert(codUserPaths).values({ userId: learner.id }).returning({ id: codUserPaths.id })
  ;[{ id: bothPathId }] = await db.insert(bothUserPaths).values({ userId: learner.id }).returning({ id: bothUserPaths.id })
  ;[{ id: contentId }] = await db
    .insert(codContentPool)
    .values({ url: `https://www.youtube.com/watch?v=jvp${Date.now()}`, type: 'youtube', title: 'UAT video', sourceQuery: 'test' })
    .returning({ id: codContentPool.id })
})

afterAll(async () => {
  await db.delete(codContentPool).where(eq(codContentPool.id, contentId))
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
  it('validates its input', async () => {
    expect((await save({ pathId: codPathId, positionSec: -3, watchPct: 5 })).status).toBe(422)
  })
})

describe('Blended video position', () => {
  const itemId = crypto.randomUUID()
  const save = (body: object, token = learner.token) =>
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
  it('needs a signed-in learner', async () => {
    expect((await save({ ...base, pathId: bothPathId, positionSec: 5, watchPct: 5 }, '')).status).toBe(401)
  })
})
