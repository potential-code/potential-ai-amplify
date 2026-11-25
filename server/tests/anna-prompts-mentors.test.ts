import { describe, it, expect } from 'bun:test'
import { ASK_ANNA_PROMPT, SIGN_UP_PROMPT } from '../../shared/anna/prompts'
import { HUMAN_MENTORS_ENABLED } from '../../shared/features'
import { browserClaims, fingerprint } from '../services/serviceTokenClaims'

/**
 * With human mentors off (the default), Anna's prompts tell her sessions aren't
 * available and her knowledge base stops describing booking, and the API still
 * fingerprints exactly the prompts the site sends.
 */
describe("Anna's prompts with human mentors off", () => {
  it('is the default', () => {
    expect(HUMAN_MENTORS_ENABLED).toBe(false)
  })

  it('tells Ask Anna not to offer sessions and to offer the AI mentors', () => {
    expect(ASK_ANNA_PROMPT).toContain('HUMAN MENTORS ARE NOT AVAILABLE RIGHT NOW')
    expect(ASK_ANNA_PROMPT).toContain('showAiMentorCards')
  })

  it('no longer explains how to book a human mentor', () => {
    for (const p of [ASK_ANNA_PROMPT, SIGN_UP_PROMPT]) {
      expect(p).not.toContain('How do I book a human mentor session?')
      expect(p).not.toContain('bookable for private 1:1 sessions')
      expect(p).not.toContain('human mentor bookings')
    }
  })

  it('is the prompt the API lets the browser send', () => {
    expect(browserClaims('sme').prompts).toContain(fingerprint(ASK_ANNA_PROMPT))
  })
})
