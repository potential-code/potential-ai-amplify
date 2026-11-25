import { describe, expect, it } from 'bun:test'
import { aiUnavailableCopy } from '../AiUnavailableBanner'

describe('AI unavailable banner copy', () => {
  it('names Anna, never Sana', () => {
    for (const on of [true, false]) {
      const { title, body } = aiUnavailableCopy(on)
      expect(title).toContain('Anna')
      expect(`${title} ${body}`).not.toMatch(/Sana|SMEEP/)
    }
  })

  it('does not mention human mentors or sessions while they are switched off', () => {
    const { body } = aiUnavailableCopy(false)
    expect(body.replace('AI Mentors', '')).not.toMatch(/mentor|session|booking/i)
  })

  it('lists mentors among what still works when they are on', () => {
    expect(aiUnavailableCopy(true).body).toContain('Courses, mentors, offers and events')
  })
})
