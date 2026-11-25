import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { withDocument } from '../routes/aiMentor.routes'

/**
 * AI mentor chat with a shared document: the document goes to the mentor as
 * text after the learner's message (like the hosted Potential chat), cut to a
 * fixed length, and bad payloads stop at validation before reaching the bot.
 */

let learner: TestUser
const BOT = '6b06d2d73460887e1896aeb0'

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

describe('mentor chat limits', () => {
  it('caps each learner at 20 messages a minute and 300 a day', async () => {
    const { chatLimits } = await import('../routes/aiMentor.routes')
    const [perMinute, perDay] = chatLimits
    const user = await createTestUser('mentor-cap')
    // An invalid body is counted by both limiters and then stops at validation,
    // so nothing reaches the bot service.
    const send = () => api('POST', `/api/ai-mentors/${BOT}/chat`, { token: user.token, body: { message: '', sessionId: 's1' } })
    process.env['RATE_LIMITS'] = 'on'
    try {
      for (let i = 0; i < 20; i++) expect((await send()).status).toBe(422)
      const minute = await send()
      expect(minute.status).toBe(429)
      expect(minute.body.error.code).toBe('RATE_LIMITED')

      // Fast-forward through the day: clear the minute window every 20 messages.
      // (The refused 21st never reached the daily counter.)
      let sent = 20
      while (sent < 300) {
        await perMinute!.resetKey(`ai-mentor-chat:w:${user.id}`)
        for (let i = 0; i < 20 && sent < 300; i++, sent++) expect((await send()).status).toBe(422)
      }
      await perMinute!.resetKey(`ai-mentor-chat:w:${user.id}`)
      const day = await send()
      expect(day.status).toBe(429)
      expect(day.body.error.message).toContain("today's limit")

      // Another learner is unaffected.
      expect((await api('POST', `/api/ai-mentors/${BOT}/chat`, { token: learner.token, body: { message: '', sessionId: 's1' } })).status).toBe(422)
    } finally {
      delete process.env['RATE_LIMITS']
      await perMinute!.resetKey(`ai-mentor-chat:w:${user.id}`)
      await perDay!.resetKey(`ai-mentor-chat:d:${user.id}`)
    }
  })
})
