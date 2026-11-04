import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startTestServer, stopTestServer, createTestUser, cleanupFixtureUsers, ORIGIN, type TestUser } from './helpers'

/**
 * Ask Anna's document sharing: the file is read in memory and only its text
 * comes back, for the browser to send with the learner's next message.
 */

let base: string
let user: TestUser

beforeAll(async () => {
  base = await startTestServer()
  user = await createTestUser('askdocs')
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

type DocResponse = {
  success: boolean
  data?: { name: string; kind: string; text: string; truncated: boolean; pages?: number }
  error?: { code: string; message: string }
}

async function share(file: Blob, name: string, token: string | null = user.token) {
  const form = new FormData()
  form.append('file', file, name)
  const res = await fetch(`${base}/api/ask-sana/documents`, {
    method: 'POST',
    headers: { Origin: ORIGIN, ...(token ? { Cookie: token } : {}) },
    body: form,
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as DocResponse }
}

describe('Ask Anna documents', () => {
  it('reads a text file', async () => {
    const res = await share(new Blob(['Our café sells coffee.\r\n\r\n\r\nGoal: double sales.']), 'plan.txt')
    expect(res.status).toBe(200)
    expect(res.body.data?.kind).toBe('text')
    expect(res.body.data?.text).toBe('Our café sells coffee.\n\nGoal: double sales.')
    expect(res.body.data?.truncated).toBe(false)
  })

  it('reads a PDF, with its page count', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage().drawText('Business plan for Lina Bakery', { x: 50, y: 700, size: 14, font })
    pdf.addPage().drawText('Target customers: office workers', { x: 50, y: 700, size: 14, font })
    const res = await share(new Blob([Buffer.from(await pdf.save())], { type: 'application/pdf' }), 'bakery.pdf')
    expect(res.status).toBe(200)
    expect(res.body.data?.kind).toBe('pdf')
    expect(res.body.data?.pages).toBe(2)
    expect(res.body.data?.text).toContain('Lina Bakery')
    expect(res.body.data?.text).toContain('office workers')
  })

  it('keeps a UTF-8 file name', async () => {
    const res = await share(new Blob(['خطة العمل']), 'خطة.md')
    expect(res.status).toBe(200)
    expect(res.body.data?.name).toBe('خطة.md')
  })

  it('cuts very long documents and says so', async () => {
    const res = await share(new Blob(['word '.repeat(10_000)]), 'long.txt')
    expect(res.status).toBe(200)
    expect(res.body.data?.truncated).toBe(true)
    expect(res.body.data?.text.length).toBe(20_000)
  })

  it('refuses images and other files, whatever their name says', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect((await share(new Blob([png]), 'photo.png')).status).toBe(415)
    expect((await share(new Blob([png]), 'notes.txt')).status).toBe(415)
    expect((await share(new Blob(['not a pdf']), 'fake.docx')).status).toBe(415)
  })

  it('refuses an empty file', async () => {
    const res = await share(new Blob(['   \n  ']), 'empty.txt')
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('EMPTY_DOCUMENT')
  })

  it('needs a signed-in learner', async () => {
    expect((await share(new Blob(['hello']), 'a.txt', null)).status).toBe(401)
  })
})
