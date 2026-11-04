import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { withDocument } from '../routes/aiMentor.routes'

/**
 * AI mentor chat with a shared document: the document goes to the mentor as
 * text after the learner's message (like the hosted Potential chat), cut to a
 * fixed length, and bad payloads stop at validation before reaching the bot.
 */

let learner: TestUser
const BOT = '64b78f8ea3495eade7931f1f'

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('mentor-doc')
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('withDocument', () => {
  it('leaves a plain message alone', () => {
    expect(withDocument('Hello')).toBe('Hello')
  })

  it('attaches the document after the message', () => {
    expect(withDocument('Review this', { name: 'plan.pdf', text: 'Our plan' })).toBe('Review this\n\n[Attached document "plan.pdf"]\nOur plan')
  })

  it('cuts a long document and says so', () => {
    const out = withDocument('Hi', { name: 'long.txt', text: 'x'.repeat(15_000) })
    expect(out).toContain('(only the first part of a long document)')
    expect(out.length).toBeLessThan(12_200)
    expect(withDocument('Hi', { name: 'a.txt', text: 'short', truncated: true })).toContain('only the first part')
  })

  it('cannot break out of the document label', () => {
    expect(withDocument('Hi', { name: 'a"b\nc.txt', text: 't' })).toContain(`[Attached document "a'b'c.txt"]`)
  })
})

describe('POST /api/ai-mentors/:botId/chat', () => {
  const chat = (body: object, bot = BOT) => api('POST', `/api/ai-mentors/${bot}/chat`, { token: learner.token, body })

  it('rejects a document that is too long or has no name', async () => {
    expect((await chat({ message: 'Hi', sessionId: 's1', document: { name: 'big.txt', text: 'x'.repeat(20_001) } })).status).toBe(422)
    expect((await chat({ message: 'Hi', sessionId: 's1', document: { name: '', text: 'x' } })).status).toBe(422)
  })

  it('still refuses unknown mentors and signed-out callers', async () => {
    expect((await chat({ message: 'Hi', sessionId: 's1' }, 'not-a-bot')).status).toBe(404)
    expect((await api('POST', `/api/ai-mentors/${BOT}/chat`, { body: { message: 'Hi', sessionId: 's1' } })).status).toBe(401)
  })
})
