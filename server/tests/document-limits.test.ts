import { describe, it, expect } from 'bun:test'
import { deflateRawSync } from 'node:zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { assertDocxWithinLimits, readDocumentText, DocumentReadError, PDF_MAX_PAGES } from '../services/documentText.service'

/**
 * Word files are zips, and a zip can inflate to far more than it claims. The
 * reader checks what the XML really unpacks to (with a hard cap) before mammoth
 * opens the file, so one small upload can't exhaust the server's memory.
 * PDFs are read up to PDF_MAX_PAGES pages, and any read is given up after a
 * deadline. (Ported from SMEEP, plus the page and time tests.)
 */

type Entry = { name: string; data: Buffer; claimedSize?: number }

/** A minimal zip: deflated entries, a central directory and its end record. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name)
    const packed = deflateRawSync(e.data)
    const size = e.claimedSize ?? e.data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, packed)
    centrals.push(central, name)
    offset += 30 + name.length + packed.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

const docx = (body: string) =>
  zip([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
    },
    {
      name: 'word/document.xml',
      data: Buffer.from(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    },
  ])

describe('Word file limits', () => {
  it('still reads an ordinary document', async () => {
    const result = await readDocumentText(docx("Lina's Bakery marketing plan"), 'plan.docx')
    expect(result.kind).toBe('docx')
    expect(result.text).toContain("Lina's Bakery")
  })

  it('refuses a zip bomb before mammoth unpacks it', async () => {
    const bomb = docx('a'.repeat(50 * 1024 * 1024))
    expect(bomb.length).toBeLessThan(200_000)
    const started = Date.now()
    await expect(readDocumentText(bomb, 'bomb.docx')).rejects.toBeInstanceOf(DocumentReadError)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it("doesn't trust the sizes a zip claims for itself", () => {
    const liar = zip([{ name: 'word/document.xml', data: Buffer.alloc(30 * 1024 * 1024, 0x61), claimedSize: 100 }])
    expect(() => assertDocxWithinLimits(liar)).toThrow(DocumentReadError)
  })

  it('refuses a file that only looks like a zip', () => {
    expect(() => assertDocxWithinLimits(Buffer.from('PK not really a zip'))).toThrow(DocumentReadError)
  })
})

async function pdfWithPages(n: number): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= n; i++) pdf.addPage([200, 200]).drawText(`marker${i}x`, { x: 20, y: 100, size: 12, font })
  return Buffer.from(await pdf.save())
}

describe('PDF limits', () => {
  it(`reads at most ${PDF_MAX_PAGES} pages, but reports the real page count`, async () => {
    const result = await readDocumentText(await pdfWithPages(PDF_MAX_PAGES + 5), 'long.pdf')
    expect(result.pages).toBe(PDF_MAX_PAGES + 5)
    expect(result.text).toContain(`marker${PDF_MAX_PAGES}x`)
    expect(result.text).not.toContain(`marker${PDF_MAX_PAGES + 1}x`)
  })

  it('gives up on a document that takes too long to read', async () => {
    const pdf = await pdfWithPages(3)
    const err = await readDocumentText(pdf, 'slow.pdf', { timeoutMs: 0 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocumentReadError)
    expect((err as DocumentReadError).message).toContain('too long')
    expect((await readDocumentText(pdf, 'ok.pdf')).pages).toBe(3)
  })
})
