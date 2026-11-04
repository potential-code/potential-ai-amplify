import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { db } from '../db'
import { learningBlocks } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createCourse, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Course video resume: the player saves where the learner is, so they pick up
 * there on any device. Watched % only goes up and a finished block stays
 * finished.
 */

let user: TestUser
let videoBlockId: string
let otherBlockId: string
let notEnrolledCourse: { id: string }
let notEnrolledVideoId: string

type Saved = { success: boolean; data: { videoPositionSec: number; videoWatchPct: number } }
const save = (blockId: string, positionSec: number, watchPct: number, token = user.token) =>
  api<Saved>('PUT', `/api/lms/learning-blocks/${blockId}/video-position`, { token, body: { positionSec, watchPct } })

beforeAll(async () => {
  await startTestServer()
  user = await createTestUser('videopos')
  const course = await createCourse({ unitCount: 1 })
  const unitId = course.unitIds[0]!
  const [video] = await db.insert(learningBlocks)
    .values({ unitId, type: 'video', title: 'Watch', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', order: 2 })
    .returning({ id: learningBlocks.id })
  videoBlockId = video!.id
  otherBlockId = course.blocks[0]!.textId
  notEnrolledCourse = await createCourse({ unitCount: 1 })
  const [loose] = await db.insert(learningBlocks)
    .values({ unitId: notEnrolledCourse.unitIds[0]!, type: 'video', title: 'Watch', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', order: 2 })
    .returning({ id: learningBlocks.id })
  notEnrolledVideoId = loose!.id
  expect((await api('POST', `/api/lms/courses/${course.id}/enroll`, { token: user.token })).status).toBeLessThan(300)
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('video position', () => {
  it('saves the position and watched %', async () => {
    const res = await save(videoBlockId, 42, 30)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ videoPositionSec: 42, videoWatchPct: 30 })
  })

  it('moves the position back, but never lowers watched %', async () => {
    const res = await save(videoBlockId, 10, 12)
    expect(res.body.data).toEqual({ videoPositionSec: 10, videoWatchPct: 30 })
  })

  it('keeps a completed block completed', async () => {
    await api('POST', `/api/lms/learning-blocks/${videoBlockId}/progress`, { token: user.token, body: { status: 'completed', videoWatchPct: 95 } })
    await save(videoBlockId, 5, 40)
    const res = await api<{ success: boolean; data: { status: string } }>('POST', `/api/lms/learning-blocks/${videoBlockId}/progress`, {
      token: user.token,
      body: { status: 'completed' },
    })
    expect(res.body.data.status).toBe('completed')
  })

  it('refuses a block that is not a video', async () => {
    expect((await save(otherBlockId, 5, 10)).status).toBe(404)
  })

  it('refuses a course the learner is not enrolled in', async () => {
    expect((await save(notEnrolledVideoId, 5, 10)).status).toBe(404)
  })

  it('rejects bad values', async () => {
    expect((await save(videoBlockId, -1, 10)).status).toBe(422)
    expect((await save(videoBlockId, 5, 101)).status).toBe(422)
  })

  it('needs a signed-in learner', async () => {
    expect((await save(videoBlockId, 5, 10, '')).status).toBe(401)
  })
})
