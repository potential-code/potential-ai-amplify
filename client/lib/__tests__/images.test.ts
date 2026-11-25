import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { optimizedSrc } from '../images'
import { OPTIMIZED_IMAGES } from '../optimizedImages.generated'

const PUBLIC = join(import.meta.dir, '../../public')

describe('optimizedSrc', () => {
  it('swaps a listed image for its .webp copy', () => {
    expect(optimizedSrc('/images/redesign/hero.png')).toBe('/images/redesign/hero.webp')
    expect(optimizedSrc('/images/courses/optimizing-nutrition.jpg')).toBe('/images/courses/optimizing-nutrition.webp')
  })

  it('leaves unlisted, remote and empty paths alone', () => {
    expect(optimizedSrc('/uploads/avatars/me.png')).toBe('/uploads/avatars/me.png')
    expect(optimizedSrc('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(optimizedSrc(null)).toBeNull()
    expect(optimizedSrc(undefined)).toBeUndefined()
    expect(optimizedSrc('')).toBe('')
  })

  it('every listed image has its .webp beside it (run bun run images:optimize after adding images)', () => {
    for (const src of OPTIMIZED_IMAGES) {
      expect(existsSync(join(PUBLIC, src.replace(/\.(png|jpe?g)$/i, '.webp')))).toBe(true)
    }
  })
})

describe('Anna avatar files', () => {
  it('are small enough for a 96/200 px avatar', () => {
    for (const name of ['anna-avatar-96.png', 'anna-avatar-96.webp', 'anna-avatar-200.png', 'anna-avatar-200.webp']) {
      const file = Bun.file(join(PUBLIC, 'images/redesign', name))
      expect(file.size).toBeGreaterThan(0)
      expect(file.size).toBeLessThan(150 * 1024)
    }
  })
})
