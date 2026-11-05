import jwt from 'jsonwebtoken'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { translationCache } from '../db/schema'
import { SERVER_CLAIMS } from './serviceTokenClaims'

/**
 * Translation of AI Amplify content for the Multi Learning page (course names,
 * lesson text, exam questions). Ported from VX Academy's contentTranslation
 * service, with two changes: the model call goes through potential-ai
 * (/api/learning/translate — this server holds no LLM key), and the cache is
 * a row-per-string table instead of a jsonb blob.
 *
 * Content changes rarely and is shared by every learner, so each string is
 * translated once per language and kept. Any failure — a model error, a
 * malformed reply, a timeout — returns the English original: a learner may
 * see an untranslated line, never a broken page.
 */

export type ContentLanguage = 'ar' | 'hi' | 'ur'
export type TranslationDomain = 'catalogue' | 'lesson'

export function isContentLanguage(value: unknown): value is ContentLanguage {
  return value === 'ar' || value === 'hi' || value === 'ur'
}

const BATCH_SIZE = 25

/**
 * Zero-width characters and uneven spacing stripped, so the same visible text
 * resolves to one row. Line breaks are kept: lesson text is Markdown, where a
 * list is one item per line, and the translator keeps Markdown as-is. Flattening
 * them turned bullet lists into one run-on paragraph in Arabic, Hindi and Urdu.
 */
function normalise(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type CacheId = `${TranslationDomain}:${ContentLanguage}`

const memory = new Map<CacheId, Map<string, string>>()
const loaded = new Map<CacheId, Promise<void>>()
/** Serialises work per domain and language so overlapping requests do not pay twice. */
const queue = new Map<CacheId, Promise<unknown>>()

function loadFromDatabase(domain: TranslationDomain, lang: ContentLanguage): Promise<void> {
  const id: CacheId = `${domain}:${lang}`
  const existing = loaded.get(id)
  if (existing) return existing

  const promise = (async () => {
    const entries = new Map<string, string>()
    try {
      const rows = await db
        .select({ source: translationCache.source, target: translationCache.target })
        .from(translationCache)
        .where(and(eq(translationCache.domain, domain), eq(translationCache.lang, lang)))
      for (const row of rows) {
        if (row.target.trim()) entries.set(row.source, row.target)
      }
    } catch (error) {
      console.error(`[translation] could not load ${id} cache:`, error)
    }
    memory.set(id, entries)
  })()

  loaded.set(id, promise)
  return promise
}

async function persist(domain: TranslationDomain, lang: ContentLanguage, pairs: Array<[string, string]>): Promise<void> {
  if (pairs.length === 0) return
  await db
    .insert(translationCache)
    .values(pairs.map(([source, target]) => ({ domain, lang, source, target })))
    .onConflictDoNothing()
}

async function callPotentialAi(texts: string[], lang: ContentLanguage, domain: TranslationDomain): Promise<string[] | null> {
  const base = process.env['NEXT_PUBLIC_AI_BACKEND_URL']?.replace(/\/$/, '')
  const secret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!base || !secret) {
    console.warn('[translation] AI backend not configured; content stays in English')
    return null
  }
  const token = jwt.sign({ platformId: 'ai-amplify', userId: 'tutor-translation', ...SERVER_CLAIMS }, secret, {
    algorithm: 'HS256',
    expiresIn: 300,
  })
  const res = await fetch(`${base}/api/learning/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ texts, targetLang: lang, domain }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    console.error(`[translation] potential-ai returned ${res.status}`)
    return null
  }
  const body = (await res.json()) as { success?: boolean; data?: { translations?: unknown } }
  const translations = body?.data?.translations
  if (
    !Array.isArray(translations) ||
    translations.length !== texts.length ||
    !translations.every((t) => typeof t === 'string' && t.trim())
  ) {
    console.error('[translation] unusable reply from potential-ai')
    return null
  }
  return translations as string[]
}

/**
 * Translate a set of strings. Returns a lookup from each original string to
 * its translation, falling back to the original wherever a translation is not
 * available.
 */
export async function translateContent(
  texts: Array<string | null | undefined>,
  lang: ContentLanguage,
  domain: TranslationDomain,
): Promise<(text: string) => string> {
  const id: CacheId = `${domain}:${lang}`
  await loadFromDatabase(domain, lang)

  const previous = queue.get(id) ?? Promise.resolve()
  const work = previous.then(async () => {
    const cache = memory.get(id)!
    const missing = [
      ...new Set(
        texts
          .filter((t): t is string => typeof t === 'string')
          .map(normalise)
          .filter((t) => t.length > 0 && !cache.has(t)),
      ),
    ]
    if (missing.length === 0) return

    const batches: string[][] = []
    for (let i = 0; i < missing.length; i += BATCH_SIZE) batches.push(missing.slice(i, i + BATCH_SIZE))

    // Batches are independent: wall time is one call, not one per batch.
    const outcomes = await Promise.all(
      batches.map(async (batch) => {
        try {
          return { batch, translated: await callPotentialAi(batch, lang, domain) }
        } catch (error) {
          console.error(`[translation] ${id} batch failed:`, error)
          return { batch, translated: null }
        }
      }),
    )

    const added: Array<[string, string]> = []
    for (const { batch, translated } of outcomes) {
      if (!translated) continue
      batch.forEach((source, index) => {
        const target = translated[index]!.trim()
        cache.set(source, target)
        added.push([source, target])
      })
    }
    try {
      await persist(domain, lang, added)
    } catch (error) {
      // Still served from memory for this process.
      console.error(`[translation] could not persist ${id} cache:`, error)
    }
  })

  queue.set(id, work.catch(() => undefined))
  await work.catch(() => undefined)

  const cache = memory.get(id)!
  return (text: string) => cache.get(normalise(text)) ?? text
}

/** Drop cached rows (admin/tooling convenience; unused in the request path). */
export async function forgetTranslations(domain: TranslationDomain, lang: ContentLanguage, sources: string[]): Promise<void> {
  const normalised = sources.map(normalise)
  await db
    .delete(translationCache)
    .where(
      and(
        eq(translationCache.domain, domain),
        eq(translationCache.lang, lang),
        inArray(translationCache.source, normalised),
      ),
    )
  const cache = memory.get(`${domain}:${lang}`)
  for (const s of normalised) cache?.delete(s)
}
