import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Human mentors are off unless HUMAN_MENTORS_ENABLED=true: the mentor lists
 * are empty and open times and booking are refused, so nobody can book a
 * mentor who can't sign in. Turning it on gives the normal behaviour back.
 */

let learner: TestUser
let mentor: TestUser
const SLOT = '00000000-0000-4000-8000-000000000000'

beforeAll(async () => {
  delete process.env['HUMAN_MENTORS_ENABLED']
  await startTestServer()
  learner = await createTestUser('hm-learner')
  mentor = await createUser('mentor', 'E2E hm-mentor')
})

afterEach(() => {
  delete process.env['HUMAN_MENTORS_ENABLED']
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('human mentors switched off (the default)', () => {
  it('lists no mentors, publicly or signed in', async () => {
    const pub = await api('GET', '/api/mentors/public')
    expect(pub.status).toBe(200)
    expect(pub.body).toEqual([])
    const signedIn = await api('GET', '/api/mentors', { token: learner.token })
    expect(signedIn.status).toBe(200)
    expect(signedIn.body).toEqual([])
  })

  it('refuses open times and booking', async () => {
    const avail = await api('GET', `/api/mentors/${mentor.id}/availability`, { token: learner.token })
    expect(avail.status).toBe(403)
    expect(avail.body.error.code).toBe('HUMAN_MENTORS_OFF')
    const book = await api('POST', '/api/sessions', { token: learner.token, body: { slotId: SLOT } })
    expect(book.status).toBe(403)
    expect(book.body.error.code).toBe('HUMAN_MENTORS_OFF')
  })

  it('still lets a learner see their sessions', async () => {
    const mine = await api('GET', '/api/sessions', { token: learner.token })
    expect(mine.status).toBe(200)
    expect(mine.body).toHaveProperty('upcoming')
  })
})

describe('human mentors switched on', () => {
  it('lists mentors and lets booking through to its own checks', async () => {
    process.env['HUMAN_MENTORS_ENABLED'] = 'true'
    const list = await api<{ id: string }[]>('GET', '/api/mentors', { token: learner.token })
    expect(list.status).toBe(200)
    expect(list.body.some((m) => m.id === mentor.id)).toBe(true)
    const avail = await api('GET', `/api/mentors/${mentor.id}/availability`, { token: learner.token })
    expect(avail.status).toBe(200)
    const book = await api('POST', '/api/sessions', { token: learner.token, body: { slotId: SLOT } })
    expect(book.body?.error?.code).not.toBe('HUMAN_MENTORS_OFF')
  })
})

describe('what learners see of a mentor', () => {
  it('lists the same safe fields signed in as publicly: no email, no meeting link', async () => {
    process.env['HUMAN_MENTORS_ENABLED'] = 'true'
    await db.update(users).set({ meetingLink: 'https://zoom.example/j/private-room', bio: 'Retail coach' }).where(eq(users.id, mentor.id))
    const signedIn = await api<Record<string, unknown>[]>('GET', '/api/mentors', { token: learner.token })
    const pub = await api<Record<string, unknown>[]>('GET', '/api/mentors/public')
    const mine = signedIn.body.find((m) => m['id'] === mentor.id)!
    expect(mine['bio']).toBe('Retail coach')
    expect(JSON.stringify(mine)).not.toContain(mentor.email)
    expect(JSON.stringify(signedIn.body)).not.toContain('private-room')
    for (const m of signedIn.body) {
      expect(m).not.toHaveProperty('email')
      expect(m).not.toHaveProperty('meetingLink')
    }
    // Public: the same fields minus the time zone.
    const publicKeys = Object.keys(pub.body.find((m) => m['id'] === mentor.id)!).sort()
    expect(Object.keys(mine).filter((k) => k !== 'timezone').sort()).toEqual(publicKeys)
  })
})
