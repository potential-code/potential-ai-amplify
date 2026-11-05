'use client'

/**
 * Ask Anna's message extras: try again (on top of the shared copy and read
 * aloud), and documents the learner shares with Anna (sent as text with
 * their message, shown as a file chip on it).
 */
import type { CopilotChatUserMessageProps } from '@copilotkit/react-core/v2'
import { FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import { SanaUserMessage } from '@/components/learning-ui/SanaMessages'
import type { SanaAttachOptions, SanaSharedDocument } from '@/components/learning-ui/SanaChatInput'
import type { LearnerLanguage } from '@/components/tutor/api'
import { SanaReplyButtons, type ReadAloud } from '@/components/learning-ui/SanaReplyActions'

export const ASK_ACTION_STRINGS: Record<LearnerLanguage, { docDefault: string; askAbout: (name: string) => string }> = {
  en: {
    docDefault: 'Please read this document and tell me what stands out.',
    askAbout: (name) => `Ask about ${name}`,
  },
  ar: {
    docDefault: 'من فضلك اقرئي هذا المستند وأخبريني بأهم ما فيه.',
    askAbout: (name) => `اسأل عن ${name}`,
  },
  hi: {
    docDefault: 'कृपया यह दस्तावेज़ पढ़ें और बताइए कि इसमें क्या ख़ास है।',
    askAbout: (name) => `${name} के बारे में पूछें`,
  },
  ur: {
    docDefault: 'براہِ کرم یہ دستاویز پڑھیں اور بتائیں کہ اس میں اہم کیا ہے۔',
    askAbout: (name) => `${name} کے بارے میں پوچھیں`,
  },
}

// ── Shared documents ─────────────────────────────────────────────────────────

const DOC_MARKER = '\n\n[Attached document "'

export const ASK_DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv'

/** Reads a document on the AI Amplify server (nothing is stored there). Also used by the AI mentor chat. */
export async function readDocument(file: File): Promise<SanaSharedDocument> {
  if (file.size > 15 * 1024 * 1024) throw new Error('That file is over 15 MB. Try a smaller one.')
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/ask-sana/documents', { method: 'POST', body: form, credentials: 'same-origin' })
  const body = (await res.json().catch(() => null)) as
    | { success: true; data: SanaSharedDocument }
    | { success: false; error?: { message?: string } }
    | null
  if (!res.ok || !body || body.success !== true) {
    const message = body && body.success === false ? body.error?.message : undefined
    throw new Error(message || 'That file could not be read. Try again.')
  }
  return body.data
}

/** What Anna receives: the learner's words, then the document's text. */
function composeWithDocument(message: string, doc: SanaSharedDocument): string {
  const note = doc.truncated ? ' (only the first part of a long document)' : ''
  return `${message}${DOC_MARKER}${doc.name.replace(/"/g, "'")}"${note}]\n${doc.text}`
}

/** The learner's words and the shared document's name, from a sent message. */
export function splitSharedDocument(text: string): { message: string; docName: string | null } {
  const at = text.indexOf(DOC_MARKER)
  if (at < 0) return { message: text, docName: null }
  const rest = text.slice(at + DOC_MARKER.length)
  return { message: text.slice(0, at), docName: rest.slice(0, rest.indexOf('"')) || 'Document' }
}

export function askSanaAttachOptions(lang: LearnerLanguage): SanaAttachOptions {
  const t = ASK_ACTION_STRINGS[lang]
  return {
    accept: ASK_DOCUMENT_ACCEPT,
    read: readDocument,
    compose: composeWithDocument,
    defaultMessage: t.docDefault,
    askAbout: t.askAbout,
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content.map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : '')).join('')
  return ''
}

/** The learner's message, with a shared document shown as a file chip. */
export function AskSanaUserMessage(props: CopilotChatUserMessageProps) {
  const raw = contentText(props.message.content)
  const { message, docName } = splitSharedDocument(raw.replace(/\s*<!--[\s\S]*?-->/g, ''))
  if (!docName) {
    // Hidden notes (e.g. the reply language) are for Anna, not the bubble.
    const shown = raw === message ? props : { ...props, message: { ...props.message, content: message } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <SanaUserMessage {...(shown as any)} />
  }
  return (
    <motion.div
      className="mb-4 flex flex-col items-end gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <span className="sana-sent-file">
        <FileText className="h-4 w-4 flex-none" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{docName}</span>
      </span>
      {message.trim() && (
        <div className="sana-bubble-user" dir="auto">
          {message}
        </div>
      )}
    </motion.div>
  )
}

// ── Reply actions (shared with the other Anna chats, plus try again) ────────

export type { ReadAloud } from '@/components/learning-ui/SanaReplyActions'

export function AskSanaReplyActions(props: {
  id: string
  text: string
  isLast: boolean
  lang: LearnerLanguage
  readAloud: ReadAloud
  onRegenerate: () => void
  busy: boolean
  question?: string
}) {
  return <SanaReplyButtons {...props} reportSurface="ask-sana" />
}
