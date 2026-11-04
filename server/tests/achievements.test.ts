import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, users, pointsEvents, notifications, userBadges } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createCourse, cleanupFixtureUsers, type TestUser } from './helpers'
import { awardPointsForUnit } from '../services/lms/progress.service'
import { recordLearningStep } from '../services/streak.service'
import { displayName } from '../services/achievements.service'

/**
 * Points history, the leaderboard (points earned, first name + initial, opt
 * out) and badges (stored once, one bell notification).
 */

let top: TestUser
let other: TestUser
let unitId: string
let courseId: string
let perUnit: number

type Board = {
  data: {
    entries: { name: string; points: number; isYou: boolean; rank: number }[]
    you: { rank: number; points: number } | null
    hidden: boolean
  }
}
const board = (token: string, period = 'week') => api<Board>('GET', `/api/me/leaderboard?period=${period}`, { token })

beforeAll(async () => {
  // The new-badge bell is a learner notification: on here, off by default.
  process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
  await startTestServer()
  top = await createTestUser('lb')
  other = await createTestUser('lb-other')
  const course = await createCourse({ pointsPerUnit: 10 })
  const row = { unitId: course.unitIds[0]!, courseId: course.id, perUnit: 10 }
  ;({ unitId, courseId, perUnit } = row)
})

afterAll(async () => {
  delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('points', () => {
  it('awards a unit once, however often it is completed', async () => {
    await awardPointsForUnit(top.id, courseId, unitId)
    await awardPointsForUnit(top.id, courseId, unitId)
    const [u] = await db.select({ points: users.points }).from(users).where(eq(users.id, top.id))
    expect(u!.points).toBe(perUnit)
    const events = await db.select().from(pointsEvents).where(eq(pointsEvents.userId, top.id))
    expect(events.length).toBe(1)
  })
})

describe('leaderboard', () => {
  it('ranks by points earned and shows only a first name and initial', async () => {
    // Make sure the fixture is in the top 10 whatever else is in this database.
    await db.insert(pointsEvents).values({ userId: top.id, reason: 'test', ref: 'boost', amount: 1_000_000 })
    const mine = (await board(top.token)).body.data
    expect(mine.you?.rank).toBe(1)
    expect(mine.entries[0]).toMatchObject({ name: 'E2E L.', isYou: true, points: 1_000_000 + perUnit })

    const seen = (await board(other.token)).body.data
    expect(seen.entries[0]).toMatchObject({ name: 'E2E L.', isYou: false })
    expect(JSON.stringify(seen)).not.toContain(top.email)
    expect(seen.you).toBeNull()
  })

  it('does not drop a rank when points are spent', async () => {
    await db.update(users).set({ points: 0 }).where(eq(users.id, top.id))
    expect((await board(top.token, 'all')).body.data.you?.points).toBe(1_000_000 + perUnit)
  })

  it('hides a learner who opts out from everyone else', async () => {
    expect((await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: false } })).status).toBe(200)
    const seen = (await board(other.token)).body.data
    expect(seen.entries.some((e) => e.name === 'E2E L.' && e.points > 1_000_000)).toBe(false)
    const mine = (await board(top.token)).body.data
    expect(mine.hidden).toBe(true)
    expect(mine.you?.rank).toBe(1)
    await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: true } })
  })

  it('rejects a bad visibility value and falls back to a month for an unknown period', async () => {
    expect((await api('PUT', '/api/me/leaderboard-visibility', { token: top.token, body: { show: 'yes' } })).status).toBe(422)
    const res = await api<{ data: { period: string } }>('GET', '/api/me/leaderboard?period=forever', { token: top.token })
    expect(res.body.data.period).toBe('month')
  })

  it('shortens names', () => {
    expect(displayName('Rashid Al Amri')).toBe('Rashid A.')
    expect(displayName('  Fatima  ')).toBe('Fatima')
    expect(displayName('')).toBe('Learner')
  })
})

describe('badges', () => {
  it('earns a badge once and rings the bell once', async () => {
    await recordLearningStep(other.id)
    const get = () =>
      api<{ data: { earned: number; badges: { key: string; earnedAt: string | null; progress: { current: number; target: number } }[] } }>(
        'GET',
        '/api/me/achievements',
        { token: other.token },
      )
    const first = (await get()).body.data
    const step = first.badges.find((b) => b.key === 'first_step')
    expect(step?.earnedAt).not.toBeNull()
    const streak = first.badges.find((b) => b.key === 'streak_7')
    expect(streak).toMatchObject({ earnedAt: null, progress: { current: 1, target: 7 } })

    await get()
    const stored = await db.select().from(userBadges).where(eq(userBadges.userId, other.id))
    expect(stored.filter((b) => b.badge === 'first_step').length).toBe(1)
    const bell = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, other.id), eq(notifications.dedupeKey, 'badge:first_step')))
    expect(bell.length).toBe(1)
    expect(bell[0]!.link).toBe('/dashboard/achievements')
  })

  it('gives mentors no badges', async () => {
    const mentor = await createTestUser('lb-mentor')
    await db.update(users).set({ role: 'mentor' }).where(eq(users.id, mentor.id))
    await recordLearningStep(mentor.id)
    await new Promise((r) => setTimeout(r, 300))
    expect((await db.select().from(userBadges).where(eq(userBadges.userId, mentor.id))).length).toBe(0)
  })
})
