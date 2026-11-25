import { describe, expect, it } from 'bun:test'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SHELL_CONFIG, allItems } from '../nav'

const APP = join(import.meta.dir, '../../../app')

/** The app/ folders (route groups stripped) that hold a page for `href`. */
function hasPage(href: string): boolean {
  const parts = href.split('/').filter(Boolean)
  const walk = (dir: string, rest: string[]): boolean => {
    const entries = readdirSync(dir)
    if (rest.length === 0 && entries.includes('page.tsx')) return true
    for (const e of entries) {
      const p = join(dir, e)
      if (!statSync(p).isDirectory()) continue
      if (e.startsWith('(') && walk(p, rest)) return true
      if (rest.length && e === rest[0] && walk(p, rest.slice(1))) return true
    }
    return false
  }
  return walk(APP, parts)
}

describe('mentor menu', () => {
  it('has the Calendar page, as in SMEEP', () => {
    const labels = SHELL_CONFIG.mentor.groups.flatMap((g) => g.items.map((i) => `${i.label} ${i.href}`))
    expect(labels).toContain('Calendar /mentor/dashboard/calendar')
  })

  it('every mentor menu link has a page', () => {
    for (const item of allItems(SHELL_CONFIG.mentor)) expect(hasPage(item.href)).toBe(true)
  })
})
