import type { Request, Response } from 'express';
import { generateBusinessDocumentPdf } from '../services/aiTools.service';
import { sendMail } from '../mail/mailer';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

/** Longest document body accepted (about 15 pages of text). */
const MAX_CONTENT_CHARS = 40_000;

/** Accepted documentType slugs — validated before processing. */
const ALLOWED_TYPES = new Set([
  'business-ideas',
  'business-plan',
  'marketing-plan',
  'product-proposal',
]);

/** Human-readable labels for each document type slug. */
const TYPE_LABELS: Record<string, string> = {
  'business-ideas': 'Business Ideas',
  'business-plan': 'Business Plan',
  'marketing-plan': 'Marketing Plan',
  'product-proposal': 'Product / Sales Proposal',
};

/**
 * POST /api/ai-tools/generate-pdf
 *
 * Generates a branded PDF from AI-produced business document content and
 * emails it to the signed-in user's own account email. It never sends to an
 * address from the request: that turned the platform's mail domain into a
 * channel for sending anything to anyone.
 *
 * Request body:
 *   - documentType  {string}  One of the ALLOWED_TYPES slugs.
 *   - title         {string?} Optional document title; falls back to the type label.
 *   - content       {string}  Plain-text body to render into the PDF.
 *
 * Responds with `{ success: true, emailSent: true, email }` on success.
 */
export async function generatePdf(req: Request, res: Response): Promise<void> {
  const { documentType, title, content } = req.body as {
    documentType?: string;
    title?: string;
    content?: string;
  };

  if (!documentType || !ALLOWED_TYPES.has(documentType)) {
    res.status(400).json({ error: 'Invalid or missing documentType' });
    return;
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  if (content.length > MAX_CONTENT_CHARS) {
    res.status(413).json({ success: false, error: { message: 'That document is too long to send.', code: 'CONTENT_TOO_LONG' } });
    return;
  }

  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.user!.userId));
  if (!account) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const emailAddress = account.email;

  const docTitle =
    typeof title === 'string' && title.trim()
      ? title.trim()
      : (TYPE_LABELS[documentType] ?? documentType);
  const label = TYPE_LABELS[documentType] ?? 'Business Document';

  try {
    const pdfBuffer = await generateBusinessDocumentPdf(documentType, docTitle, content);

    await sendMail({
      to: emailAddress,
      subject: `Your ${label} — AI Amplify Business Assistant`,
      template: 'business-document',
      context: { documentTypeName: label, title: docTitle },
      attachments: [
        {
          filename: `${documentType}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ success: true, emailSent: true, email: emailAddress });
  } catch (err) {
    console.error('[aiTools] generatePdf error', err);
    res.status(500).json({ error: 'Failed to generate or send document' });
  }
}
