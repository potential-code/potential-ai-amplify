import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import {
  users,
  organisations,
  aiTurns,
  assessments,
  assessmentQuestions,
  assessmentAttempts,
  blockQuestions,
  learningBlocks,
  modules,
  units,
  courseEnrollments,
  userUnitProgress,
  questionAnswers,
} from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createCourse, cleanupFixtureUsers, signIn, type TestUser } from './helpers'

/**
 * A participant's full record for their organisation's partner: courses unit
 * by unit, exam answers, action plans and saved AI
 * chats. Chats are saved only while the learner is in an organisation.
 */

let adminToken: string
let partnerToken: string
let member: TestUser
let outsider: TestUser
let orgId: string
let courseId: string

type Record_ = {
  data: {
    profile: { email: string }
    courses: { courseId: string; units: { status: string }[]; exams: { answers: { isCorrect: boolean; chosen: number | null }[] }[]; responses: { kind: string; answer: string }[] }[]
    conversations: { surfaceLabel: string; question: string | null; answer: string }[]
    activity: { kind: string }[]
  }
}

beforeAll(async () => {
  await startTestServer()
  const admin = await createTestUser('pr-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)

  const [org] = await db.insert(organisations).values({ name: 'UAT Org Record', type: 'government', joinCode: `PR${Date.now().toString(36).toUpperCase()}`.slice(0, 8) }).returning()
  orgId = org!.id
  member = await createTestUser('pr-member')
  outsider = await createTestUser('pr-outsider')
  await db.update(users).set({ organisationId: orgId }).where(eq(users.id, member.id))

  // A partner login for the organisation.
  const partner = await createTestUser('pr-partner')
  await db.update(users).set({ role: 'partner', organisationId: orgId }).where(eq(users.id, partner.id))
  partnerToken = await signIn(partner.email, partner.password)

  // The member's learning: a course with a finished unit, a pre-test attempt,
  // and an action-plan answer.
  const course = await createCourse({ withPreTest: true })
  const [a] = await db.select().from(assessments).where(eq(assessments.id, course.preAssessmentId!))
  courseId = a!.courseId
  await db.insert(courseEnrollments).values({ userId: member.id, courseId }).onConflictDoNothing()
  const [unit] = await db.select({ id: units.id }).from(units).innerJoin(modules, eq(modules.id, units.moduleId)).where(eq(modules.courseId, courseId)).limit(1)
  await db.insert(userUnitProgress).values({ userId: member.id, unitId: unit!.id, status: 'completed', completedAt: new Date() })
  const qs = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, a!.id))
  await db.insert(assessmentAttempts).values({
    userId: member.id,
    assessmentId: a!.id,
    attemptNumber: 1,
    answers: Object.fromEntries(qs.map((q, i) => [q.id, i === 0 ? q.correctAnswer : (q.correctAnswer + 1) % Math.max(2, q.options.length)])),
    score: 50,
    passed: false,
    completedAt: new Date(),
  })
  const [plan] = await db
    .select({ id: blockQuestions.id })
    .from(blockQuestions)
    .innerJoin(learningBlocks, eq(learningBlocks.id, blockQuestions.blockId))
    .innerJoin(units, eq(units.id, learningBlocks.unitId))
    .innerJoin(modules, eq(modules.id, units.moduleId))
    .where(and(eq(modules.courseId, courseId), eq(blockQuestions.kind, 'action-plan')))
    .limit(1)
  if (plan) await db.insert(questionAnswers).values({ userId: member.id, questionId: plan.id, answerData: { openEndedAnswer: 'Open a second branch in Sharjah' } })
})

afterAll(async () => {
  await db.delete(organisations).where(like(organisations.name, 'UAT Org Record%'))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const turn = (token: string, messageId: string) =>
  api<{ data: { saved: boolean } }>('POST', '/api/me/ai-turns', {
    token,
    body: { surface: 'ask-sana', messageId, question: 'How do I price my cakes?', answer: 'Start from your costs, then add a margin.' },
  })

describe('saving AI chats', () => {
  it('saves chats only for learners in an organisation, once per answer', async () => {
    expect((await turn(member.token, 'm1')).body.data.saved).toBe(true)
    expect((await turn(member.token, 'm1')).body.data.saved).toBe(true)
    expect((await db.select().from(aiTurns).where(eq(aiTurns.userId, member.id))).length).toBe(1)
    expect((await turn(outsider.token, 'o1')).body.data.saved).toBe(false)
    expect((await db.select().from(aiTurns).where(eq(aiTurns.userId, outsider.id))).length).toBe(0)
  })

  it('checks what it is sent', async () => {
    expect((await api('POST', '/api/me/ai-turns', { token: member.token, body: { surface: 'Bad Surface!', messageId: 'x', answer: 'a' } })).status).toBe(422)
    expect((await api('POST', '/api/me/ai-turns', { body: { surface: 'ask-sana', messageId: 'x', answer: 'a' } })).status).toBe(401)
  })
})

describe('participant record', () => {
  it("gives the partner the participant's full record", async () => {
    const res = await api<Record_>('GET', `/api/partner/learners/${member.id}`, { token: partnerToken })
    expect(res.status).toBe(200)
    const r = res.body.data
    expect(r.profile.email).toBe(member.email)
    const course = r.courses.find((c) => c.courseId === courseId)!
    expect(course.units.some((u) => u.status === 'completed')).toBe(true)
    const answers = course.exams[0]!.answers
    expect(answers[0]!.isCorrect).toBe(true)
    if (answers.length > 1) expect(answers[1]!.isCorrect).toBe(false)
    if (course.responses.length) expect(course.responses.find((x) => x.kind === 'action-plan')?.answer).toBe('Open a second branch in Sharjah')
    expect(r.conversations[0]).toMatchObject({ surfaceLabel: 'Ask Anna', question: 'How do I price my cakes?' })
    expect(r.activity.some((a) => a.kind === 'unit')).toBe(true)
  })

  it("is a 404 for anyone outside the partner's organisation, and admin-or-partner only", async () => {
    expect((await api('GET', `/api/partner/learners/${outsider.id}`, { token: partnerToken })).status).toBe(404)
    expect((await api('GET', `/api/partner/learners/${member.id}`, { token: outsider.token })).status).toBe(403)
    expect((await api('GET', `/api/admin/organisations/${orgId}/learners/${member.id}`, { token: adminToken })).status).toBe(200)
    expect((await api('GET', `/api/admin/organisations/${orgId}/learners/${outsider.id}`, { token: adminToken })).status).toBe(404)
  })

  it('deletes saved chats when the learner leaves, and the record is gone for the partner', async () => {
    await api('POST', '/api/me/organisation/leave', { token: member.token })
    expect((await db.select().from(aiTurns).where(eq(aiTurns.userId, member.id))).length).toBe(0)
    expect((await api('GET', `/api/partner/learners/${member.id}`, { token: partnerToken })).status).toBe(404)
    expect((await turn(member.token, 'm2')).body.data.saved).toBe(false)
  })
})
