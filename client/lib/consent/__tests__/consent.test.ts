/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for window/dataLayer */
import { describe, expect, it } from 'bun:test'
import { validGtmId } from '../gtmId'
import { CONSENT_KEY, CONSENT_VERSION, readChoice, saveChoice } from '../consentStorage'
import { bootGtm, setConsent, isTrackedUrl, DENIED, GRANTED } from '../gtm'
import { createConsentStore } from '../store'

/** A Map-backed stand-in for localStorage. */
function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  }
}

/** Just enough window/document for the GTM loader: records appended scripts. */
function fakeWindow(start = '/', opts: { entries?: { url: string; sameDocument?: boolean }[] } = {}) {
  const appended: { src: string; async: boolean; dataLayerLength: number }[] = []
  const cookies: string[] = []
  const pushed: string[] = []
  const listeners: { type: string; fn: (e: any) => void; capture: boolean }[] = []
  const location: any = { hostname: 'aiamplify.potential.org', origin: 'https://aiamplify.potential.org' }
  const go = (url: string) => {
    const u = new URL(url, 'https://aiamplify.potential.org')
    Object.assign(location, { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash })
  }
  go(start)
  const nav = { assigned: [] as string[], replaced: [] as string[], reloads: 0 }
  const navigate = {
    assign: (u: string) => void nav.assigned.push(u),
    replace: (u: string) => void nav.replaced.push(u),
    reload: () => void nav.reloads++,
  }
  const win: any = {
    location,
    history: {
      pushState: (_s: unknown, _t: string, url?: string | URL | null) => {
        pushed.push(String(url))
        if (url) go(String(url))
      },
      replaceState: (_s: unknown, _t: string, url?: string | URL | null) => {
        pushed.push('replace:' + String(url))
        if (url) go(String(url))
      },
    },
    addEventListener: (type: string, fn: (e: any) => void, capture?: boolean) => listeners.push({ type, fn, capture: !!capture }),
    /** Simulates the browser going back/forward to `url`, then firing popstate. */
    ...(opts.entries ? { navigation: { entries: () => opts.entries } } : {}),
    /** Simulates a fragment change to `url`, then firing hashchange. */
    hashTo(url: string) {
      go(url)
      let stopped = false
      const e = { stopImmediatePropagation: () => void (stopped = true) }
      for (const l of listeners.filter((x) => x.type === 'hashchange')) {
        if (stopped) break
        l.fn(e)
      }
      return { stopped }
    },
    popTo(url: string) {
      go(url)
      let stopped = false
      const e = { stopImmediatePropagation: () => void (stopped = true) }
      const later: string[] = []
      for (const l of listeners.filter((x) => x.type === 'popstate')) {
        if (stopped) break
        l.fn(e)
      }
      return { stopped, later }
    },
    document: {
      createElement: () => ({ src: '', async: false }),
      head: {
        appendChild: (el: { src: string; async: boolean }) => {
          appended.push({ src: el.src, async: el.async, dataLayerLength: win.dataLayer.length })
        },
      },
      get cookie() {
        return 'session=1; _ga=GA1.1.1; _ga_ABC=GS1; _gcl_au=1.1; other=2'
      },
      set cookie(v: string) {
        cookies.push(v)
      },
    },
  }
  return { win, appended, cookies, pushed, nav, navigate, listeners }
}

/** gtag pushes `arguments` objects; turn them into plain arrays to compare. */
const entries = (dl: unknown[]) => dl.map((e) => (e && typeof e === 'object' && 'length' in (e as object) ? Array.from(e as ArrayLike<unknown>) : e))

describe('GTM container id', () => {
  it('accepts GTM-XXXX ids only', () => {
    expect(validGtmId('GTM-54W3N48W')).toBe('GTM-54W3N48W')
    expect(validGtmId('  GTM-TEST1234 ')).toBe('GTM-TEST1234')
    expect(validGtmId('GTM-ABCD')).toBe('GTM-ABCD')
    expect(validGtmId('GTM-ABCDEFGHIJ')).toBe('GTM-ABCDEFGHIJ')
  })

  it("refuses the retired per-site containers (SMEEP, Hadafi, AI Amplify): only Potential.org's Main may load", () => {
    for (const old of ['GTM-NGQNTZJ', 'GTM-5C9G6FPK', 'GTM-PCDGSJLR', ' GTM-NGQNTZJ ']) expect(validGtmId(old)).toBeNull()
    expect(validGtmId('GTM-54W3N48W')).toBe('GTM-54W3N48W')
  })

  it('treats empty, unset or malformed ids as unset', () => {
    for (const bad of [undefined, null, '', '   ', 'GTM-', 'GTM-abc1234', 'GTM-ABC', 'GTM-ABCDEFGHIJK', 'G-ZBLPYC3MYL', 'AW-18570988662', 'GTM-ABCD"><script>', 'gtm-54w3n48w', 42]) {
      expect(validGtmId(bad)).toBeNull()
    }
  })
})

describe('stored cookie choice', () => {
  const now = new Date('2026-11-16T10:00:00Z')

  it("is kept under AI Amplify's own key", () => {
    expect(CONSENT_KEY).toBe('amplify.cookieConsent')
  })

  it('has no choice on a first visit', () => {
    expect(readChoice(memoryStorage(), now)).toBeNull()
  })

  it('remembers accept and reject with the version and date', () => {
    const s = memoryStorage()
    saveChoice(s, 'accepted', now)
    expect(JSON.parse(s.dump()[CONSENT_KEY])).toEqual({ choice: 'accepted', version: CONSENT_VERSION, date: now.toISOString() })
    expect(readChoice(s, now)).toBe('accepted')
    saveChoice(s, 'rejected', now)
    expect(readChoice(s, now)).toBe('rejected')
  })

  it('asks again after 12 months', () => {
    const s = memoryStorage()
    saveChoice(s, 'accepted', new Date('2025-11-16T10:00:00Z'))
    expect(readChoice(s, new Date('2026-11-16T09:59:59Z'))).toBe('accepted')
    expect(readChoice(s, new Date('2026-11-16T10:00:00Z'))).toBeNull()
  })

  it('asks again when the consent version changes', () => {
    const s = memoryStorage({ [CONSENT_KEY]: JSON.stringify({ choice: 'accepted', version: CONSENT_VERSION - 1, date: now.toISOString() }) })
    expect(readChoice(s, now)).toBeNull()
  })

  it('ignores junk, future dates and unknown choices', () => {
    for (const raw of ['nope', '{}', JSON.stringify({ choice: 'maybe', version: CONSENT_VERSION, date: now.toISOString() }), JSON.stringify({ choice: 'accepted', version: CONSENT_VERSION, date: 'x' }), JSON.stringify({ choice: 'accepted', version: CONSENT_VERSION, date: '2027-06-01T00:00:00Z' })]) {
      expect(readChoice(memoryStorage({ [CONSENT_KEY]: raw }), now)).toBeNull()
    }
  })

  it('survives storage that throws (private mode)', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} }
    expect(readChoice(broken, now)).toBeNull()
    expect(() => saveChoice(broken, 'accepted', now)).not.toThrow()
  })
})

describe('GTM loader', () => {
  it('sets consent to denied before the GTM script is added', () => {
    const { win, appended } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', null)
    expect(entries(win.dataLayer)[0]).toEqual([
      'consent',
      'default',
      { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 },
    ])
    expect(appended).toHaveLength(1)
    expect(appended[0].src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234')
    expect(appended[0].async).toBe(true)
    // Everything up to and including gtm.start was queued before the script.
    const startAt = win.dataLayer.findIndex((e: any) => e?.event === 'gtm.js')
    expect(startAt).toBeGreaterThan(0)
    expect(appended[0].dataLayerLength).toBe(startAt + 1)
    // No consent update for a visitor who hasn't chosen.
    expect(entries(win.dataLayer).filter((e: any) => Array.isArray(e) && e[1] === 'update')).toHaveLength(0)
  })

  it("re-applies a returning visitor's Accept before GTM loads", () => {
    const { win, appended } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', 'accepted')
    const list = entries(win.dataLayer)
    const updateAt = list.findIndex((e: any) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update')
    expect(list[updateAt]).toEqual(['consent', 'update', GRANTED])
    expect(updateAt).toBeLessThan(appended[0].dataLayerLength)
  })

  it('keeps a returning Reject denied', () => {
    const { win } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', 'rejected')
    const updates = entries(win.dataLayer).filter((e: any) => Array.isArray(e) && e[1] === 'update')
    expect(updates.every((u: any) => JSON.stringify(u[2]) === JSON.stringify(DENIED))).toBe(true)
  })

  it('loads the container once', () => {
    const { win, appended } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', null)
    bootGtm(win, 'GTM-TEST1234', null)
    expect(appended).toHaveLength(1)
  })

  it('updates consent to granted or denied', () => {
    const { win } = fakeWindow()
    bootGtm(win, 'GTM-TEST1234', null)
    setConsent(win, 'accepted')
    setConsent(win, 'rejected')
    const updates = entries(win.dataLayer).filter((e: any) => Array.isArray(e) && e[1] === 'update')
    expect(updates).toEqual([
      ['consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }],
      ['consent', 'update', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ])
  })

  it('tracks only allowlisted public pages and the learner area, with harmless query strings', () => {
    for (const p of [
      '/',
      '/?utm_source=google&utm_campaign=sme&gclid=abc123&gbraid=x&wbraid=y',
      '/#community',
      '/sign-up',
      '/sign-up?with=sana',
      '/dashboard/anna',
      '/dashboard/events/1/recording',
      '/login',
      '/login?expired=1',
      '/dashboard',
      '/dashboard/',
      '/dashboard/courses/1?course=2',
      'https://aiamplify.potential.org/dashboard/learning',
    ]) {
      expect([p, isTrackedUrl(p)]).toEqual([p, true])
    }
  })

  it('never tracks pages whose URL can carry a token or code, staff areas or unknown pages', () => {
    for (const p of [
      // token-bearing pages, with or without the token
      '/mentor/setup?token=abc',
      '/mentor/setup',
      '/partner/setup?token=abc',
      '/partner/setup',
      '/partner/setup-anything',
      '/unsubscribe?token=abc',
      '/unsubscribe',
      // secrets in the query string of an otherwise tracked page
      '/sign-up?code=INVITE1',
      '/sign-up?org=ACME42',
      // AI Amplify is invite-only: invite and organisation links are never tracked
      '/sign-up?code=AMPLIFY-IGXVWW',
      '/sign-up?code=AMPLIFY-IGXVWW&org=ACME42',
      '/sign-up?with=sana&code=AMPLIFY-IGXVWW',
      '/login?token=abc',
      '/?key=abc',
      '/?utm_source=x&token=abc',
      '/dashboard?secret=1',
      '/dashboard?TOKEN=abc',
      '/dashboard/offers/1/checkout?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret',
      // payment pages (card form, billing details) and free-text search
      '/dashboard/offers/1/checkout',
      '/dashboard/offers/1/checkout/',
      '/dashboard/billing',
      '/dashboard/payments/1',
      // paid product: the offers list, each offer's price and buy pages
      '/dashboard/offers',
      '/dashboard/offers/',
      '/dashboard/offers?success=1',
      '/dashboard/offers/1',
      '/dashboard/offers/1/buy',
      '/dashboard/courses?q=ahmed%40example.com',
      '/#access_token=abc',
      // staff areas and anything not on the allowlist
      '/admin',
      '/admin/dashboard',
      '/mentor/dashboard',
      '/mentor/dashboard/sessions',
      '/partner',
      '/partner/learners/1',
      '/dashboard-x',
      '/some-new-page',
      'https://evil.example/',
    ]) {
      expect([p, isTrackedUrl(p)]).toEqual([p, false])
    }
  })

  it('after GTM loads, a client-side navigation to an untracked URL becomes a full page load', () => {
    const { win, pushed, nav, navigate } = fakeWindow('/login')
    bootGtm(win, 'GTM-TEST1234', null, navigate)
    win.history.pushState(null, '', '/dashboard/courses')
    expect(pushed).toEqual(['/dashboard/courses'])
    win.history.pushState(null, '', '/admin/dashboard')
    win.history.replaceState(null, '', '/unsubscribe?token=abc')
    expect(pushed).toEqual(['/dashboard/courses']) // never reached the real history
    // push -> assign (new entry); replace -> location.replace (no extra entry, Back isn't trapped)
    expect(nav.assigned).toEqual(['https://aiamplify.potential.org/admin/dashboard'])
    expect(nav.replaced).toEqual(['https://aiamplify.potential.org/unsubscribe?token=abc'])
    expect(win.location.pathname).toBe('/dashboard/courses')
  })

  it('after GTM loads, a fragment carrying values reloads the page without GTM', () => {
    const { win, nav, navigate } = fakeWindow('/')
    bootGtm(win, 'GTM-TEST1234', null, navigate)
    let gtmSaw = 0
    win.addEventListener('hashchange', () => gtmSaw++)
    expect(win.hashTo('/#community').stopped).toBe(false)
    expect([nav.reloads, gtmSaw]).toEqual([0, 1])
    expect(win.hashTo('/#access_token=abc').stopped).toBe(true)
    expect([nav.reloads, gtmSaw]).toEqual([1, 1])
  })

  it('after GTM loads, Back/Forward to an untracked URL reloads before any other listener sees it', () => {
    const { win, nav, navigate, listeners } = fakeWindow('/')
    bootGtm(win, 'GTM-TEST1234', null, navigate)
    let gtmSaw = 0
    win.addEventListener('popstate', () => gtmSaw++) // stands in for GTM's own listener
    expect(listeners.findIndex((l) => l.type === 'popstate' && l.capture)).toBe(0)
    win.popTo('/dashboard')
    expect([nav.reloads, gtmSaw]).toEqual([0, 1])
    const r = win.popTo('/mentor/setup?token=abc')
    expect(r.stopped).toBe(true)
    expect([nav.reloads, gtmSaw]).toEqual([1, 1])
  })
})

describe('consent store', () => {
  const now = () => new Date('2026-11-16T10:00:00Z')

  function setup(stored?: 'accepted' | 'rejected') {
    const storage = memoryStorage()
    if (stored) saveChoice(storage, stored, now())
    const { win, appended, cookies, nav, navigate } = fakeWindow()
    const store = createConsentStore({ storage, win, now, navigate })
    return { store, storage, win, appended, cookies, nav }
  }

  it('does nothing while GTM is not configured', () => {
    const { store, win, appended } = setup()
    store.configure(null)
    store.enterPath('/')
    expect(store.getState()).toEqual({ gtmId: null, choice: null, open: false, tracked: false, running: false })
    expect(win.dataLayer).toBeUndefined()
    expect(appended).toHaveLength(0)
    store.openSettings()
    expect(store.getState().open).toBe(false)
    store.trackSignUp('web_form')
    expect(win.dataLayer).toBeUndefined()
  })

  it('opens the banner on a first visit, with consent denied', () => {
    const { store, win, appended } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    expect(store.getState()).toEqual({ gtmId: 'GTM-TEST1234', choice: null, open: true, tracked: true, running: true })
    expect(appended).toHaveLength(1)
    expect(entries(win.dataLayer)[0][1]).toBe('default')
  })

  it('Accept stores the choice, grants consent and closes', () => {
    const { store, storage, win } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    store.accept()
    expect(store.getState()).toMatchObject({ choice: 'accepted', open: false })
    expect(readChoice(storage, now())).toBe('accepted')
    expect(entries(win.dataLayer).at(-1)).toEqual(['consent', 'update', GRANTED])
  })

  it('Reject stores the choice, keeps consent denied and clears Google cookies', () => {
    const { store, storage, win, cookies } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    store.reject()
    expect(store.getState()).toMatchObject({ choice: 'rejected', open: false })
    expect(readChoice(storage, now())).toBe('rejected')
    expect(entries(win.dataLayer).at(-1)).toEqual(['consent', 'update', DENIED])
    const cleared = cookies.map((c) => c.split('=')[0])
    expect(cleared).toContain('_ga')
    expect(cleared).toContain('_ga_ABC')
    expect(cleared).toContain('_gcl_au')
    expect(cleared).not.toContain('session')
    expect(cleared).not.toContain('other')
    // Only this host: host-only cookies and domain=aiamplify.potential.org, never
    // the parent domain other Potential.org sites share.
    for (const c of cookies) expect(c).not.toMatch(/domain=\.?potential\.org(;|$)/i)
    expect(cookies.filter((c) => c.startsWith('_ga=')).map((c) => (c.match(/domain=([^;]+)/) ?? [null, 'host-only'])[1])).toEqual([
      'host-only',
      'aiamplify.potential.org',
    ])
  })

  it("doesn't show the banner to a returning visitor, and Cookie settings reopens it", () => {
    const { store } = setup('rejected')
    store.configure('GTM-TEST1234')
    store.enterPath('/dashboard')
    expect(store.getState()).toEqual({ gtmId: 'GTM-TEST1234', choice: 'rejected', open: false, tracked: true, running: true })
    store.openSettings()
    expect(store.getState().open).toBe(true)
    store.accept()
    expect(store.getState()).toMatchObject({ choice: 'accepted', open: false })
  })

  it('does not load GTM or show the banner on untracked pages', () => {
    for (const path of ['/admin/dashboard', '/mentor/setup?token=abc', '/unsubscribe?token=abc', '/sign-up?code=INVITE1']) {
      const { store, win, appended, nav } = setup()
      store.configure('GTM-TEST1234')
      store.enterPath(path)
      expect(store.getState()).toMatchObject({ open: false, tracked: false })
      expect(appended).toHaveLength(0)
      expect(win.dataLayer).toBeUndefined()
      expect(nav.reloads).toBe(0) // nothing to unload
      // A later public page in this same document doesn't start it at all
      // (see the "never showed" tests); the next full page load will.
      win.location.href = 'https://aiamplify.potential.org/'
      store.enterPath('/')
      expect(appended).toHaveLength(0)
      expect([nav.assigned, nav.reloads]).toEqual([[], 0])
      expect(store.getState().open).toBe(false)
    }
  })

  it('hides the banner and reloads the page when an untracked page is entered after GTM loaded', () => {
    const { store, nav } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    expect(store.getState()).toMatchObject({ open: true, tracked: true })
    store.enterPath('/admin/dashboard')
    expect(store.getState().tracked).toBe(false)
    expect(nav.reloads).toBe(1)
  })

  it('pushes sign_up with the method only, no personal data', () => {
    const { store, win } = setup()
    store.configure('GTM-TEST1234')
    store.enterPath('/sign-up')
    store.trackSignUp('web_form')
    store.trackSignUp('anna_chat')
    const events = win.dataLayer.filter((e: any) => e?.event === 'sign_up')
    expect(events).toEqual([
      { event: 'sign_up', method: 'web_form' },
      { event: 'sign_up', method: 'anna_chat' },
    ])
  })

  it('notifies subscribers on change', () => {
    const { store } = setup()
    let calls = 0
    const off = store.subscribe(() => calls++)
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    store.accept()
    off()
    store.openSettings()
    expect(calls).toBeGreaterThanOrEqual(2)
    const snap = store.getState()
    expect(store.getState()).toBe(snap) // stable snapshot for useSyncExternalStore
  })
})

describe('wiring', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const root = path.join(import.meta.dir, '..', '..', '..')
  const src = (f: string) => readFileSync(path.join(root, f), 'utf8')

  it('the root layout mounts the consent loader on every page', () => {
    expect(src('app/layout.tsx')).toContain('<CookieConsent />')
  })

  it('the loader takes the id from the runtime /public-config, never a hardcoded id', () => {
    const c = src('components/consent/CookieConsent.tsx')
    expect(c).toContain("fetch('/public-config'")
    expect(c).not.toMatch(/GTM-[A-Z0-9]{4,}/)
    expect(src('app/public-config/route.ts')).toContain('process.env.GTM_CONTAINER_ID')
  })

  it('every footer has Cookie settings', () => {
    for (const f of ['components/landing/LandingFooter.tsx', 'components/auth/AuthSplit.tsx', 'views/dashboard/Support.tsx', 'components/shell/AppShell.tsx']) {
      expect(src(f)).toContain('<CookieSettingsLink')
    }
  })
})

describe('redirects after sign-in and setup', () => {
  const now = () => new Date('2026-11-16T10:00:00Z')

  it('use a full page load for untracked homes once GTM is loaded', () => {
    const { win, nav, navigate } = fakeWindow('/login')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    const pushed: string[] = []
    const push = (h: string) => void pushed.push(h)
    // GTM off: exactly as before (client-side).
    store.go('/admin/dashboard', push)
    expect([pushed, nav.assigned]).toEqual([['/admin/dashboard'], []])
    store.configure('GTM-TEST1234')
    store.enterPath('/login')
    store.go('/dashboard', push)
    for (const home of ['/admin/dashboard', '/mentor/dashboard', '/partner']) store.go(home, push)
    expect(pushed).toEqual(['/admin/dashboard', '/dashboard'])
    expect(nav.assigned).toEqual(['/admin/dashboard', '/mentor/dashboard', '/partner'])
    // A replace (RequireAuth's role redirect) stays a replace: no Back trap.
    store.go('/admin/dashboard', push, 'replace')
    expect(nav.replaced).toEqual(['/admin/dashboard'])
    expect(nav.assigned).toHaveLength(3)
  })

  it('every staff-capable redirect goes through goTo', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const root = path.join(import.meta.dir, '..', '..', '..')
    for (const f of ['views/Login.tsx', 'views/SignUp.tsx', 'components/landing/LandingRegistrationChat.tsx', 'views/mentor/Setup.tsx', 'views/partner/Setup.tsx', 'components/dashboard/RequireAuth.tsx']) {
      const src = readFileSync(path.join(root, f), 'utf8')
      expect([f, /router\.(push|replace)\((homeFor|['"]\/(admin|mentor|partner))/.test(src)]).toEqual([f, false])
      expect([f, src.includes('goTo(')]).toEqual([f, true])
    }
  })
})

describe('leaving a tracked page', () => {
  it("doesn't let a fallback reload cancel the guard's full load to the new URL", () => {
    const { win, nav, navigate } = fakeWindow('/')
    const store = createConsentStore({ storage: memoryStorage(), win, now: () => new Date('2026-11-16T10:00:00Z'), navigate })
    store.configure('GTM-TEST1234')
    store.enterPath('/')
    // Next renders the new route, then calls pushState (the guard turns it
    // into a full load), then our route effect sees the new pathname while the
    // address bar still shows the old URL.
    win.history.pushState(null, '', '/mentor/setup?token=abc')
    store.enterPath('/mentor/setup')
    expect(nav.assigned).toEqual(['https://aiamplify.potential.org/mentor/setup?token=abc'])
    expect(nav.reloads).toBe(0)
  })
})

describe('GTM only starts in a document that never showed an untracked URL', () => {
  const now = () => new Date('2026-11-16T10:00:00Z')

  it('an untracked URL earlier in this document: GTM never starts in it, no redirect or reload', () => {
    const { win, appended, nav, navigate } = fakeWindow('/sign-up?code=INVITE1&org=ACME')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    store.enterPath('/sign-up?code=INVITE1&org=ACME') // before /public-config answers
    store.configure('GTM-TEST1234')
    win.history.pushState(null, '', '/login') // client-side, no guard (GTM isn't running)
    store.enterPath('/login')
    store.enterPath('/')
    expect(appended).toHaveLength(0)
    expect(win.dataLayer).toBeUndefined()
    expect([nav.assigned, nav.replaced, nav.reloads]).toEqual([[], [], 0])
    expect(store.getState()).toMatchObject({ tracked: true, open: false })
    // Nothing is pushed for a sign-up in this document either.
    store.trackSignUp('web_form')
    expect(win.dataLayer).toBeUndefined()
  })

  it('the next full page load on a tracked URL starts fresh', () => {
    const { win, appended, nav, navigate } = fakeWindow('/login')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    store.configure('GTM-TEST1234')
    store.enterPath('/login')
    expect([appended.length, nav.reloads, nav.assigned.length]).toEqual([1, 0, 0])
    expect(store.getState()).toMatchObject({ tracked: true, open: true })
  })

  it("checks this document's history entries (Navigation API)", () => {
    const tainted = fakeWindow('/login', {
      entries: [
        { url: 'https://aiamplify.potential.org/sign-up?code=INVITE1', sameDocument: true },
        { url: 'https://aiamplify.potential.org/login', sameDocument: true },
      ],
    })
    const s1 = createConsentStore({ storage: memoryStorage(), win: tainted.win, now, navigate: tainted.navigate })
    s1.configure('GTM-TEST1234')
    s1.enterPath('/login')
    expect([tainted.appended.length, tainted.nav.assigned, tainted.nav.reloads]).toEqual([0, [], 0])

    // Entries from earlier documents are full navigations away; they don't count.
    const clean = fakeWindow('/login', {
      entries: [
        { url: 'https://aiamplify.potential.org/admin/dashboard', sameDocument: false },
        { url: 'https://aiamplify.potential.org/login', sameDocument: true },
      ],
    })
    const s2 = createConsentStore({ storage: memoryStorage(), win: clean.win, now, navigate: clean.navigate })
    s2.configure('GTM-TEST1234')
    s2.enterPath('/login')
    expect([clean.appended.length, clean.nav.assigned]).toEqual([1, []])
  })

  it('reads the address bar when /public-config answers, not a stale saved path', () => {
    const { win, appended, navigate } = fakeWindow('/')
    const store = createConsentStore({ storage: memoryStorage(), win, now, navigate })
    store.enterPath('/')
    // A query-only change (no new pathname, so no enterPath) before the config arrives.
    win.history.replaceState(null, '', '/sign-up?code=INVITE1')
    store.configure('GTM-TEST1234')
    expect(appended).toHaveLength(0)
    expect(store.getState()).toMatchObject({ tracked: false, open: false })
    // Tainted for good: back on a tracked address, still no GTM in this document.
    win.history.replaceState(null, '', '/')
    store.enterPath('/')
    expect(appended).toHaveLength(0)
  })
})

describe('marketing events (Maya spec)', () => {
  const NOW = new Date('2026-11-16T10:00:00Z')
  const now = () => NOW
  const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
  const pushedEvents = (win: any) => (win.dataLayer ?? []).filter((e: any) => e && typeof e.event === 'string' && !e.event.startsWith('gtm.'))

  function running(path = '/dashboard', storage = memoryStorage()) {
    const f = fakeWindow(path)
    const store = createConsentStore({ storage, win: f.win, now, navigate: f.navigate })
    store.configure('GTM-TEST1234')
    store.enterPath(path)
    return { ...f, store, storage }
  }

  // GET /api/me/milestones: the learner's first_step badge and certificates,
  // each a row the server writes exactly once (AI Amplify's learner bell is
  // off, so the bell's notifications can't be the signal here).
  // earnedAt is the stored time (identity); ageSeconds is how long ago the
  // server stored it, by the database's own clock (the recency check).
  const firstStep = (minAgo: number) => ({ key: 'badge:first_step', earnedAt: ago(minAgo), ageSeconds: minAgo * 60 })
  const cert = (id: string, minAgo: number) => ({ key: `certificate:${id}`, earnedAt: ago(minAgo), ageSeconds: minAgo * 60 })

  it('sign_up_start: once per page per method, method only', () => {
    const { win, store } = running('/sign-up')
    store.trackSignUpStart('web_form')
    store.trackSignUpStart('web_form')
    store.trackSignUpStart('anna_chat')
    store.trackSignUpStart('anna_chat')
    expect(pushedEvents(win)).toEqual([
      { event: 'sign_up_start', method: 'web_form' },
      { event: 'sign_up_start', method: 'anna_chat' },
    ])
  })

  it('no event of any kind on an untracked page, or while GTM is off', () => {
    const r = running('/')
    r.store.enterPath('/mentor/setup?token=abc') // GTM loaded, page untracked (reload pending)
    r.store.trackSignUpStart('web_form')
    r.store.trackSignUp('web_form')
    r.store.noteMilestones([firstStep(1)], 'learner-a')
    expect(pushedEvents(r.win)).toEqual([])

    const f = fakeWindow('/dashboard')
    const storage = memoryStorage()
    const off = createConsentStore({ storage, win: f.win, now, navigate: f.navigate })
    off.configure(null)
    off.enterPath('/dashboard')
    off.trackSignUpStart('web_form')
    off.noteMilestones([firstStep(1)], 'learner-a')
    expect(f.win.dataLayer).toBeUndefined()
    expect(storage.dump()).toEqual({}) // GTM off: nothing stored either
  })

  it('first_lesson_completed: when the first_step badge is newly earned, exactly once', () => {
    const { win, store } = running()
    store.noteMilestones([], 'learner-a') // first fetch: nothing yet
    store.noteMilestones([firstStep(0)], 'learner-a') // the next poll brings the newly earned badge
    store.noteMilestones([firstStep(0)], 'learner-a')
    expect(pushedEvents(win)).toEqual([{ event: 'first_lesson_completed' }])
  })

  it('counts a badge already in the first fetch only if the server stored it in the last 10 minutes', () => {
    const recent = running()
    recent.store.noteMilestones([firstStep(2)], 'learner-a')
    expect(pushedEvents(recent.win)).toEqual([{ event: 'first_lesson_completed' }])
    const old = running()
    old.store.noteMilestones([firstStep(60 * 24)], 'learner-a')
    expect(pushedEvents(old.win)).toEqual([])
  })

  it("judges 'recent' by the server's own age, not the browser clock or the database time zone", () => {
    // Stored 1 minute ago, but the stored time reads 4 hours off (a database
    // session in another time zone, or a browser clock that is wrong).
    const skewed = { key: 'badge:first_step', earnedAt: ago(-240), ageSeconds: 60 }
    const r = running()
    r.store.noteMilestones([skewed], 'learner-a')
    expect(pushedEvents(r.win)).toEqual([{ event: 'first_lesson_completed' }])
    const old = running()
    old.store.noteMilestones([{ key: 'badge:first_step', earnedAt: ago(1), ageSeconds: 3600 }], 'learner-a')
    expect(pushedEvents(old.win)).toEqual([])
  })

  it('ignores other badges and anything else', () => {
    const { win, store } = running()
    store.noteMilestones([], 'learner-a')
    store.noteMilestones([
      { key: 'badge:streak_7', earnedAt: ago(0), ageSeconds: 0 },
      { key: 'announcement:1', earnedAt: ago(0), ageSeconds: 0 },
      { key: 'badge:first_step_x', earnedAt: ago(0), ageSeconds: 0 },
    ], 'learner-a')
    expect(pushedEvents(win)).toEqual([])
  })

  it('course_certificate: once per newly issued certificate, with no course name or ids', () => {
    const { win, store } = running('/dashboard/certificates')
    store.noteMilestones([cert('c0', 500)], 'learner-a') // an old one: not new
    store.noteMilestones([cert('c1', 0), cert('c0', 500)], 'learner-a')
    store.noteMilestones([cert('c1', 0), cert('c0', 500)], 'learner-a')
    expect(pushedEvents(win)).toEqual([{ event: 'course_certificate' }])
    const all = JSON.stringify(win.dataLayer)
    for (const s of ['c1', 'certificate:', 'earnedAt']) expect(all).not.toContain(s)
  })

  it('another tab or page load in the same browser does not report it again', () => {
    const storage = memoryStorage()
    const a = running('/dashboard', storage)
    a.store.noteMilestones([firstStep(1)], 'learner-a')
    const b = running('/dashboard/learning', storage)
    b.store.noteMilestones([firstStep(1)], 'learner-a') // the same stored row
    expect([pushedEvents(a.win).length, pushedEvents(b.win).length]).toEqual([1, 0])
    expect(Object.keys(storage.dump())).toContain('amplify.gtmReported')
  })

  it('a second learner signing in on the same browser still reports their own first step', () => {
    const storage = memoryStorage()
    const a = running('/dashboard', storage) // learner A
    a.store.noteMilestones([firstStep(5)], 'learner-a')
    const b = running('/dashboard', storage) // learner B, later, same browser
    b.store.noteMilestones([firstStep(1)], 'learner-b')
    expect([pushedEvents(a.win).length, pushedEvents(b.win).length]).toEqual([1, 1])
  })

  it('seen on a page where GTM is not running: not sent and not marked handled, so the next tracked page load can still send it', () => {
    const storage = memoryStorage()
    const a = running('/', storage)
    a.store.enterPath('/admin/dashboard') // GTM loaded, page untracked (reload pending)
    a.store.noteMilestones([firstStep(1)], 'learner-a')
    expect(storage.dump()['amplify.gtmReported']).toBeUndefined()
    const b = running('/dashboard', storage)
    b.store.noteMilestones([firstStep(1)], 'learner-a')
    expect([pushedEvents(a.win).length, pushedEvents(b.win).length]).toEqual([0, 1])
  })

  it('running: true only while GTM is actually loaded in this document on a tracked page', () => {
    const r = running('/dashboard')
    expect(r.store.getState()).toMatchObject({ tracked: true, running: true })
    r.store.enterPath('/admin/dashboard') // reload pending: tags must not fire here
    expect(r.store.getState()).toMatchObject({ tracked: false, running: false })

    const off = fakeWindow('/dashboard')
    const s = createConsentStore({ storage: memoryStorage(), win: off.win, now, navigate: off.navigate })
    s.configure(null)
    s.enterPath('/dashboard')
    expect(s.getState().running).toBe(false)
  })

  it('a tainted document (sign-up?code=, then client-side to /dashboard) never burns the first-lesson milestone', () => {
    const storage = memoryStorage()
    const f = fakeWindow('/sign-up?code=AMPLIFY-IGXVWW')
    const store = createConsentStore({ storage, win: f.win, now, navigate: f.navigate })
    store.configure('GTM-TEST1234')
    store.enterPath('/sign-up?code=AMPLIFY-IGXVWW')
    // goTo('/dashboard') after sign-up: a client-side move (GTM isn't running).
    f.win.history.pushState(null, '', '/dashboard')
    store.enterPath('/dashboard')
    // Tracked page, but GTM never started in this document.
    expect(store.getState()).toMatchObject({ tracked: true, running: false })
    expect(f.appended).toHaveLength(0)
    store.noteMilestones([firstStep(1)], 'learner-a')
    expect(f.win.dataLayer).toBeUndefined()
    expect(storage.dump()['amplify.gtmReported']).toBeUndefined() // not burned
    // The next full page load on a tracked URL starts GTM and sends it once.
    const next = running('/dashboard/learning', storage)
    next.store.noteMilestones([firstStep(1)], 'learner-a')
    next.store.noteMilestones([firstStep(1)], 'learner-a')
    expect(pushedEvents(next.win)).toEqual([{ event: 'first_lesson_completed' }])
  })

  it('a different learner in the same tab: their earlier milestones never fire as new', () => {
    const { win, store } = running()
    store.noteMilestones([firstStep(60 * 24 * 30)], 'learner-a') // A: an old badge, not new
    // A signs out and B signs in without a full page load; B's first fetch.
    const oldB = [
      { key: 'badge:first_step', earnedAt: ago(60 * 24 * 400), ageSeconds: 60 * 60 * 24 * 400 },
      cert('bbbb-1111', 60 * 24 * 400),
    ]
    store.noteMilestones(oldB, 'learner-b')
    expect(pushedEvents(win)).toEqual([])
    // B then earns a certificate: reported once.
    const issued = cert('bbbb-2222', 0)
    store.noteMilestones([...oldB, issued], 'learner-b')
    store.noteMilestones([...oldB, { ...issued, ageSeconds: 60 }], 'learner-b') // the next poll: same row
    store.noteMilestones([...oldB, { ...issued, ageSeconds: 60 }], 'learner-a') // a switch resets the seen set; the handled list still stops a repeat
    expect(pushedEvents(win)).toEqual([{ event: 'course_certificate' }])
  })

  it('switching learner resets the first-fetch baseline: a recent milestone of the new learner is still reported', () => {
    const { win, store } = running()
    store.noteMilestones([], 'learner-a')
    store.noteMilestones([firstStep(3)], 'learner-b')
    expect(pushedEvents(win)).toEqual([{ event: 'first_lesson_completed' }])
  })

  it('an old milestone never fires, even when it first shows up in a later fetch', () => {
    const { win, store } = running()
    store.noteMilestones([], 'learner-a')
    store.noteMilestones([cert('cccc-1', 60 * 24 * 400)], 'learner-a')
    store.noteMilestones([firstStep(60)], 'learner-a')
    expect(pushedEvents(win)).toEqual([])
  })

  it('wiring: the form, Anna and the learner milestone watcher report these events', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const root = path.join(import.meta.dir, '..', '..', '..')
    const src = (f: string) => readFileSync(path.join(root, f), 'utf8')
    const signUp = src('views/SignUp.tsx')
    expect(signUp).toMatch(/<form[^>]*onFocusCapture=\{startWebForm\}[^>]*onInputCapture=\{startWebForm\}/)
    expect(signUp).toContain("consentStore.trackSignUpStart('web_form')")
    const chat = src('components/landing/LandingRegistrationChat.tsx')
    expect(chat).toMatch(/const handleRegisterClick = \(\) => \{\s*consentStore\.trackSignUpStart\("anna_chat"\);/)
    const watcher = src('components/consent/MilestoneWatcher.tsx')
    expect(watcher).toContain("'/api/me/milestones'")
    expect(watcher).toContain('consentStore.noteMilestones(')
    // Polls only while GTM actually runs on a tracked page (not merely a
    // tracked page in a document where GTM never started).
    expect(watcher).toMatch(/enabled:\s*running && !!userId/)
    expect(watcher).not.toMatch(/enabled:\s*!!gtmId && tracked/)
    // Cached per learner, and the store is told whose milestones they are.
    expect(watcher).toMatch(/queryKey:\s*\['me', 'milestones', userId\]/)
    expect(watcher).toMatch(/consentStore\.noteMilestones\(data, userId\)/)
    // Mounted for learners only (the learner shell), with the signed-in user's id.
    const shell = src('components/shell/AppShell.tsx')
    expect(shell).toMatch(/role === 'learner' && user && <MilestoneWatcher userId=\{user\.id\} \/>/)
    // Sign-out is a full page load: the next person starts with fresh consent/GTM state.
    expect(shell).toMatch(/await signOut\(\)\s*\n\s*window\.location\.assign\('\/login'\)/)
    expect(shell).not.toMatch(/router\.push\('\/login'\)/)
  })
})
