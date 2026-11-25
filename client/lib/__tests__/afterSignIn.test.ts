import { describe, expect, it } from 'bun:test'
import { afterSignIn } from '../auth'

const COURSE = '/dashboard/courses/e0999a0f-8c95-4365-8c28-6fc812610df8?tab=units'

describe('afterSignIn', () => {
  it('returns a learner to the deep link they asked for', () => {
    expect(afterSignIn({ role: 'sme' }, COURSE)).toBe(COURSE)
  })

  it("uses the role's home when next is missing, unsafe or another role's area", () => {
    expect(afterSignIn({ role: 'sme' }, null)).toBe('/dashboard')
    expect(afterSignIn({ role: 'sme' }, '//evil.example/dashboard')).toBe('/dashboard')
    expect(afterSignIn({ role: 'sme' }, 'https://evil.example/dashboard')).toBe('/dashboard')
    expect(afterSignIn({ role: 'sme' }, '/admin/learners')).toBe('/dashboard')
    expect(afterSignIn({ role: 'admin' }, '/dashboard')).toBe('/admin/dashboard')
    expect(afterSignIn({ role: 'mentor' }, '/mentor/dashboard/calendar')).toBe('/mentor/dashboard/calendar')
  })

  it('treats a missing user as a learner', () => {
    expect(afterSignIn(null, COURSE)).toBe(COURSE)
    expect(afterSignIn(null, '/admin')).toBe('/dashboard')
  })
})
