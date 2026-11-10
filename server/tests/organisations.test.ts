import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, organisations, notifications, partnerInvites } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createInviteCode, cleanupFixtureUsers, signIn, ORIGIN, RUN_DOMAIN, type TestUser } from './helpers'
import { assertCanSignUp, createLearnerAccount } from '../auth/accounts'

/**
 * Organisations: sign-up codes, adding learners, partner contacts and the
 * partner dashboard, which must only ever show the partner's own learners.
 */

let adminToken: string
let outsider: TestUser
let orgId: string
let joinCode: string
let otherOrgId: string
const PARTNER_EMAIL = `partner-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`
const PASSWORD = 'e2e-partner-12345'
let partnerToken: string
let base: string

type Dashboard = { data: { organisation: { name: string }; kpis: { learners: number }; learners: { email: string }[] } }

beforeAll(async () => {
  // The "added to an organisation" bell notice to learners, as it works once
  // learner messages are switched on (off by default; see notifications.test.ts).
  process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
  base = await startTestServer()
  const admin = await createTestUser('org-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
  outsider = await createTestUser('org-outsider')
})

afterAll(async () => {
  delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
  await db.delete(users).where(like(users.email, `partner-%@${RUN_DOMAIN}`))
  await db.delete(organisations).where(like(organisations.name, 'UAT Org%'))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const admin = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: object) =>
  api<{ data: Record<string, unknown> }>(method, `/api/admin${path}`, { token: adminToken, body })

describe('organisations (admin)', () => {
  it('creates an organisation with a sign-up code, admin only', async () => {
    expect((await api('POST', '/api/admin/organisations', { token: outsider.token, body: { name: 'UAT Org Nope', type: 'government' } })).status).toBe(403)
    expect((await admin('POST', '/organisations', { name: 'U', type: 'government' })).status).toBe(422)
    const res = await admin('POST', '/organisations', { name: 'UAT Org Ministry', type: 'government' })
    expect(res.status).toBe(201)
    orgId = String(res.body.data.id)
    joinCode = String(res.body.data.joinCode)
    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    otherOrgId = String((await admin('POST', '/organisations', { name: 'UAT Org Other', type: 'university' })).body.data.id)
  })

  it('shows the organisation name for its sign-up link, and nothing once the link is off', async () => {
    const res = await api<{ data: { name: string } }>('GET', `/api/organisations/join/${joinCode.toLowerCase()}`)
    expect(res.body.data.name).toBe('UAT Org Ministry')
    await admin('PATCH', `/organisations/${otherOrgId}`, { joinEnabled: false })
    const other = await db.select({ code: organisations.joinCode }).from(organisations).where(eq(organisations.id, otherOrgId))
    expect((await api('GET', `/api/organisations/join/${other[0]!.code}`)).status).toBe(404)
    expect((await api('GET', '/api/organisations/join/NOPE1234')).status).toBe(404)
  })
})

describe('joining', () => {
  it('signs a learner up into the organisation with its code', async () => {
    const email = `org-joiner-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`
    // AI Amplify is invite-only: the organisation link comes on top of an invite code.
    const couponCode = await createInviteCode()
    await assertCanSignUp(email, couponCode, joinCode)
    const id = await createLearnerAccount({ fullName: 'E2E Joiner', email, country: 'AE', couponCode, orgCode: joinCode })
    const [u] = await db.select({ org: users.organisationId }).from(users).where(eq(users.id, id))
    expect(u!.org).toBe(orgId)
  })

  it('refuses a code that is off or unknown before creating anything', async () => {
    const email = `org-bad-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`
    const couponCode = await createInviteCode()
    await expect(assertCanSignUp(email, couponCode, 'NOPE1234')).rejects.toMatchObject({ code: 'INVALID_ORG_CODE' })
    await expect(createLearnerAccount({ fullName: 'E2E Bad', email, country: 'AE', couponCode, orgCode: 'NOPE1234' })).rejects.toMatchObject({ code: 'INVALID_ORG_CODE' })
    expect((await db.select().from(users).where(eq(users.email, email))).length).toBe(0)
  })

  it('refuses to add learners by email while learner messages are off (they could not be told)', async () => {
    delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
    try {
      const res = await admin('POST', `/organisations/${orgId}/learners`, { emails: [outsider.email] })
      expect(res.status).toBe(409)
      const [u] = await db.select({ org: users.organisationId }).from(users).where(eq(users.id, outsider.id))
      expect(u!.org).toBeNull()
      expect((await admin('GET', `/organisations/${orgId}/dashboard`)).body.data).toMatchObject({ canAddLearners: false })
    } finally {
      process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
    }
  })

  it('adds existing learners by email and tells them in the bell', async () => {
    const res = await admin('POST', `/organisations/${orgId}/learners`, { emails: [outsider.email.toUpperCase(), 'nobody@e2e.local'] })
    expect(res.body.data).toMatchObject({ added: [outsider.email], notFound: ['nobody@e2e.local'] })
    const bell = await db.select().from(notifications).where(and(eq(notifications.userId, outsider.id), eq(notifications.type, 'organisation')))
    expect(bell[0]?.title).toContain('UAT Org Ministry')
    const mine = await api<{ data: { name: string } | null }>('GET', '/api/me/organisation', { token: outsider.token })
    expect(mine.body.data?.name).toBe('UAT Org Ministry')
  })
})

describe('partner contacts', () => {
  it('invites a partner, who sets up a login tied to the organisation', async () => {
    const res = await admin('POST', `/organisations/${orgId}/partners`, { fullName: 'E2E Partner', email: PARTNER_EMAIL })
    expect(res.status).toBe(201)
    const token = String(res.body.data.setupLink).split('token=')[1]!
    const info = await api<{ data: { organisation: string; email: string } }>('GET', `/api/partner/setup-token?token=${token}`)
    expect(info.body.data).toMatchObject({ organisation: 'UAT Org Ministry', email: PARTNER_EMAIL })

    const setup = await api('POST', '/api/auth/amplify/partner-setup', { body: { token, password: PASSWORD } })
    expect(setup.status).toBe(200)
    const [u] = await db.select({ role: users.role, org: users.organisationId }).from(users).where(eq(users.email, PARTNER_EMAIL))
    expect(u).toEqual({ role: 'partner', org: orgId })
    // The link works once.
    expect((await api('GET', `/api/partner/setup-token?token=${token}`)).status).toBe(404)
    expect((await api('POST', '/api/auth/amplify/partner-setup', { body: { token, password: PASSWORD } })).status).toBe(400)
    partnerToken = await signIn(PARTNER_EMAIL, PASSWORD)
  })

  it("won't invite an email that already has an account", async () => {
    expect((await admin('POST', `/organisations/${orgId}/partners`, { fullName: 'Taken', email: outsider.email })).status).toBe(409)
  })

  it("shows the partner only their own organisation's learners", async () => {
    // A learner in the other organisation must never appear.
    const stranger = await createTestUser('org-stranger')
    await db.update(users).set({ organisationId: otherOrgId }).where(eq(users.id, stranger.id))

    const res = await api<Dashboard>('GET', '/api/partner/dashboard', { token: partnerToken })
    expect(res.status).toBe(200)
    expect(res.body.data.organisation.name).toBe('UAT Org Ministry')
    const emails = res.body.data.learners.map((l) => l.email)
    expect(emails).toContain(outsider.email)
    expect(emails).not.toContain(stranger.email)
    expect(emails).not.toContain(PARTNER_EMAIL)
    expect(res.body.data.kpis.learners).toBe(2)
  })

  it('lets the partner download their learners, and nothing else', async () => {
    const res = await fetch(`${base}/api/partner/exports/learners?format=csv`, { headers: { Origin: ORIGIN, Cookie: partnerToken } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('uat-org-ministry-learners-')
    const body = await res.text()
    expect(body).toContain(outsider.email)
    expect(body).not.toContain('org-stranger')
    expect((await api('GET', '/api/partner/exports/redemptions?format=csv', { token: partnerToken })).status).toBe(404)
  })

  it('keeps partners out of admin and learners out of the partner area', async () => {
    expect((await api('GET', '/api/admin/organisations', { token: partnerToken })).status).toBe(403)
    expect((await api('GET', `/api/admin/organisations/${otherOrgId}/dashboard`, { token: partnerToken })).status).toBe(403)
    expect((await api('GET', '/api/partner/dashboard', { token: outsider.token })).status).toBe(403)
  })
})

describe('leaving and archiving', () => {
  it('lets a learner leave their organisation', async () => {
    expect((await api('POST', '/api/me/organisation/leave', { token: outsider.token })).status).toBe(200)
    expect((await api<{ data: unknown }>('GET', '/api/me/organisation', { token: outsider.token })).body.data).toBeNull()
  })

  it('archiving ends partner access and takes learners out, keeping their accounts', async () => {
    expect((await api('GET', '/api/partner/dashboard', { token: partnerToken })).status).toBe(200)
    expect((await admin('DELETE', `/organisations/${orgId}`)).status).toBe(200)
    expect((await db.select().from(users).where(eq(users.email, PARTNER_EMAIL))).length).toBe(0)
    // Refused straight away, not after the session cache expires.
    expect((await api('GET', '/api/partner/dashboard', { token: partnerToken })).status).toBe(401)
    expect((await db.select().from(users).where(eq(users.organisationId, orgId))).length).toBe(0)
    expect((await db.select().from(partnerInvites).where(eq(partnerInvites.organisationId, orgId))).length).toBe(0)
    expect((await api('GET', `/api/organisations/join/${joinCode}`)).status).toBe(404)
  })
})
