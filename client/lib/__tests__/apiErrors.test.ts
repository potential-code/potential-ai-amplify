import { afterEach, describe, expect, it } from 'bun:test'
import { ApiError } from '../api/errors'
import { fetchCourses, apiSubmitAssessmentAttempt } from '../api/lms'
import { fetchCodPath } from '../api/cod'
import { fetchBothPath } from '../api/both'
import { fetchMediaFiles } from '../api/media'

/**
 * The server answers errors as { success: false, error: { message, code } }.
 * The feature clients must show that message (not "Request failed" or
 * "HTTP 409"), keep the code, and never show raw 5xx text.
 */
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function respond(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
}

async function caught(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('expected a rejection')
}

describe('feature API clients read the server error envelope', () => {
  it('lms: 409 already passed shows the server message and code', async () => {
    respond(409, { success: false, error: { message: 'You have already passed this test', code: 'ALREADY_PASSED' } })
    const e = await caught(apiSubmitAssessmentAttempt('a1', { q1: 0 }))
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toBe('You have already passed this test')
    expect(e.status).toBe(409)
    expect(e.code).toBe('ALREADY_PASSED')
  })

  it('lms: 429 reads as a wait-and-retry sentence, not a status code', async () => {
    respond(429, { success: false, error: { message: 'Maximum attempts exceeded', code: 'MAX_ATTEMPTS_EXCEEDED' } })
    const e = await caught(fetchCourses())
    expect(e.status).toBe(429)
    expect(e.code).toBe('MAX_ATTEMPTS_EXCEEDED')
    expect(e.message).not.toMatch(/429|Request failed/)
  })

  it('cod, both and media show the server message', async () => {
    for (const call of [fetchCodPath, fetchBothPath, fetchMediaFiles]) {
      respond(403, { success: false, error: { message: 'Open your learning path first', code: 'FORBIDDEN' } })
      const e = await caught(call())
      expect(e.message).toBe('Open your learning path first')
    }
  })

  it('a 500 never shows its raw text', async () => {
    respond(500, { success: false, error: { message: 'relation "x" does not exist' } })
    const e = await caught(fetchCodPath())
    expect(e.message).toBe('Something went wrong on our side. Please try again in a moment.')
  })
})
