import { describe, it, expect } from 'bun:test'
import { generateCode } from '../services/admin.service'

/** Invite codes are the login to a paid programme: long enough not to guess, easy to retype. */
describe('invite codes', () => {
  it('are AMPLIFY- plus 12 characters without look-alikes', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^AMPLIFY-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/)
  })

  it('do not repeat', () => {
    const codes = new Set(Array.from({ length: 5000 }, generateCode))
    expect(codes.size).toBe(5000)
  })
})
