import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, aiReports, notifications } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, signIn, type TestUser } from './helpers'
import { surfaceLabel } from '../services/aiReports.service'

/** AI safety: learners report an answer; admins hear about it and review it. */

let learner: TestUser
let adminId: string
let adminToken: string
let reportId: string

type List = { data: { counts: Record<string, number>; reports: { id: string; reasonLabel: string; surfaceLabel: string; reporterEmail: string; reply: string; question: string | null; status: string; adminNote: string | null; reviewerName: string | null }[] } }

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('rep')
  const admin = await createTestUser('rep-admin')
  adminId = admin.id
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
})

afterAll(async () => {
  await db.delete(aiReports).where(like(aiReports.reply, 'UAT report%'))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const report = (body: object, token = learner.token) => api<{ data: { id: string } }>('POST', '/api/ai-reports', { token, body })
const base = { surface: 'mentor:marketing-coach', reason: 'wrong', reply: 'UAT report: VAT in the UAE is 20%.', question: 'What is VAT in the UAE?', page: '/dashboard/ai-mentors/marketing-coach' }

describe('reporting', () => {
  it('lets a signed-in learner report an answer, and tells the admins', async () => {
    const res = await report({ ...base, note: 'It is 5%.' })
    expect(res.status).toBe(201)
    reportId = res.body.data.id
    const bell = await db.select().from(notifications).where(and(eq(notifications.userId, adminId), eq(notifications.type, 'ai_report')))
    expect(bell.length).toBeGreaterThanOrEqual(1)
    expect(bell[0]!.link).toBe('/admin/ai-safety')
  })

  it('checks what it is sent', async () => {
    expect((await report({ ...base, reason: 'boring' })).status).toBe(422)
    expect((await report({ ...base, surface: '<script>' })).status).toBe(422)
    expect((await report({ ...base, reply: '' })).status).toBe(422)
    expect((await api('POST', '/api/ai-reports', { body: base })).status).toBe(401)
  })

  it('names the AI in plain words', () => {
    expect(surfaceLabel('ask-sana')).toBe('Ask Anna')
    expect(surfaceLabel('mentor:legal-coach')).toBe('AI mentor (legal coach)')
  })
})

describe('reviewing', () => {
  it('is admin only', async () => {
    expect((await api('GET', '/api/admin/ai-reports', { token: learner.token })).status).toBe(403)
  })

  it('lists open reports with who sent them', async () => {
    const res = await api<List>('GET', '/api/admin/ai-reports?status=open', { token: adminToken })
    const r = res.body.data.reports.find((x) => x.id === reportId)!
    expect(r).toMatchObject({ reasonLabel: 'Wrong or misleading', surfaceLabel: 'AI mentor (marketing coach)', reporterEmail: learner.email, question: 'What is VAT in the UAE?' })
    expect(res.body.data.counts.open).toBeGreaterThanOrEqual(1)
  })

  it('marks a report reviewed with a note, and can reopen it', async () => {
    expect((await api('PATCH', `/api/admin/ai-reports/${reportId}`, { token: adminToken, body: { status: 'reviewed', adminNote: 'Mentor prompt fixed.' } })).status).toBe(200)
    const reviewed = await api<List>('GET', '/api/admin/ai-reports?status=reviewed', { token: adminToken })
    expect(reviewed.body.data.reports.find((x) => x.id === reportId)).toMatchObject({ status: 'reviewed', adminNote: 'Mentor prompt fixed.', reviewerName: 'E2E rep-admin' })
    await api('PATCH', `/api/admin/ai-reports/${reportId}`, { token: adminToken, body: { status: 'open' } })
    const open = await api<List>('GET', '/api/admin/ai-reports?status=open', { token: adminToken })
    expect(open.body.data.reports.some((x) => x.id === reportId)).toBe(true)
    expect((await api('PATCH', `/api/admin/ai-reports/${crypto.randomUUID()}`, { token: adminToken, body: { status: 'dismissed' } })).status).toBe(404)
  })
})
