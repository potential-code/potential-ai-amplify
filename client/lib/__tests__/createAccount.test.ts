/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for window/dataLayer */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createAccount } from '../createAccount'

/**
 * Both sign-up paths create the account through createAccount, which tells
 * Google Tag Manager about a successful sign-up with the method only: never
 * the name, email, country or any other personal data.
 */
const body = {
  fullName: 'Rashid Al Amri',
  email: 'rashid@example.test',
  country: 'Jordan',
  password: 'correct horse battery',
  verifiedToken: 'tok_123',
  termsAccepted: true as const,
  marketingOptIn: false,
}

describe('createAccount', () => {
  it('posts the sign-up and reports sign_up with the method only', async () => {
    const posts: { path: string; init: RequestInit }[] = []
    const tracked: string[] = []
    await createAccount(body, 'web_form', {
      post: async (p, init) => {
        posts.push({ path: p, init: init ?? {} })
        return {}
      },
      track: (m) => void tracked.push(m),
    })
    expect(posts).toHaveLength(1)
    expect(posts[0].path).toBe('/api/auth/amplify/sign-up')
    expect(posts[0].init.method).toBe('POST')
    expect(JSON.parse(String(posts[0].init.body))).toEqual(body)
    expect(tracked).toEqual(['web_form'])
  })

  it('reports nothing when the sign-up fails, and passes the error on', async () => {
    const tracked: string[] = []
    const err = { code: 'EMAIL_EXISTS', status: 409 }
    await expect(
      createAccount(body, 'anna_chat', {
        post: async () => {
          throw err
        },
        track: (m) => void tracked.push(m),
      }),
    ).rejects.toBe(err)
    expect(tracked).toEqual([])
  })

  it('pushes exactly { event, method } to the dataLayer by default', async () => {
    const { consentStore } = await import('../consent/store')
    const g = globalThis as any
    const saved = { window: g.window, document: g.document, localStorage: g.localStorage }
    const dataLayer: unknown[] = []
    g.window = { dataLayer, location: { hostname: 'localhost' }, document: { createElement: () => ({}), head: { appendChild() {} }, cookie: '' } }
    g.document = g.window.document
    g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
    try {
      consentStore.configure('GTM-TEST1234')
      consentStore.enterPath('/sign-up')
      await createAccount(body, 'anna_chat', { post: async () => ({}) })
      const pushed = g.window.dataLayer.filter((e: any) => e?.event === 'sign_up')
      expect(pushed).toEqual([{ event: 'sign_up', method: 'anna_chat' }])
      const all = JSON.stringify(g.window.dataLayer.map((e: unknown) => (e && typeof e === 'object' && 'length' in (e as object) ? Array.from(e as ArrayLike<unknown>) : e)))
      for (const v of [body.fullName, body.email, body.country, body.password, body.verifiedToken]) expect(all).not.toContain(v)
    } finally {
      consentStore.configure(null)
      Object.assign(g, saved)
    }
  })
})

describe('both sign-up paths use createAccount', () => {
  const root = path.join(import.meta.dir, '..', '..')
  it('the web form reports web_form', () => {
    const src = readFileSync(path.join(root, 'views/SignUp.tsx'), 'utf8')
    expect(src).toMatch(/createAccount\([\s\S]*?'web_form',?\s*\)/)
    expect(src).not.toContain("'/api/auth/amplify/sign-up',")
  })
  it("Anna's chat reports anna_chat", () => {
    const src = readFileSync(path.join(root, 'components/landing/LandingRegistrationChat.tsx'), 'utf8')
    expect(src).toMatch(/createAccount\([\s\S]*?"anna_chat"\s*\)/)
    expect(src).not.toContain('"/api/auth/amplify/sign-up",')
  })
})
