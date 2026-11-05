'use client'

/**
 * The composer for every Anna / AI mentor conversation: one bordered input
 * card with a dictation mic (browser speech recognition, shown only where the
 * browser supports it) and a magenta send button. Wires the same shared refs
 * as the dashboard composer so pill clicks and loading state keep flowing
 * through one path.
 *
 * Options (all optional, so existing surfaces keep working unchanged):
 *  - props `dictationLang` / `placeholder` / `dictation`, or
 *  - a surrounding <SanaComposerOptions.Provider> (for surfaces that hand the
 *    component to CopilotChat's `input` slot and can't pass props).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CopilotChatInputProps } from '@copilotkit/react-core/v2'
import { FileText, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react'
import {
  beforeSendRef,
  chatPlaceholderRef,
  copilotSendRef,
  disableActivePills,
  isChatInProgressRef,
  onChatInProgressChange,
  wasStoppedRef,
} from '@/components/dashboard/chat-components'
import { useDictation } from '@/components/tutor/useVoice'
import { cn } from '@/lib/utils'
import type { LearnerLanguage } from '@/components/tutor/api'

export interface SanaComposerOptionsValue {
  /** Dictation language (default English). */
  lang?: LearnerLanguage
  placeholder?: string
  /** Show the dictation mic where the browser supports it (default true). */
  dictation?: boolean
  /** Small print under the composer (e.g. an AI disclaimer). */
  footnote?: string
  /** Content shown just above the input box (e.g. quick-start chips on phones). */
  above?: ReactNode
  /** Let the learner share a document (a paperclip); off unless provided. */
  attach?: SanaAttachOptions
  /** The conversation is over (e.g. a marked exam): this note replaces the input. */
  closed?: string
}

export type SanaSharedDocument = { name: string; text: string; truncated: boolean; pages?: number }

export interface SanaAttachOptions {
  /** The file input's accept list. */
  accept: string
  /** Reads the file (server side); rejects with a message the learner can act on. */
  read: (file: File) => Promise<SanaSharedDocument>
  /** The message actually sent: what the learner typed plus the document. */
  compose: (message: string, doc: SanaSharedDocument) => string
  /** Sent when the learner shares a document without typing anything. */
  defaultMessage: string
  /** Placeholder once a document is ready, e.g. name => `Ask about ${name}`. */
  askAbout: (name: string) => string
}

type Attachment =
  | { status: 'reading'; name: string }
  | { status: 'ready'; name: string; doc: SanaSharedDocument }
  | { status: 'error'; name: string; error: string }

export const SanaComposerOptions = createContext<SanaComposerOptionsValue>({})

const MIC_LABEL: Record<LearnerLanguage, { start: string; stop: string; send: string; stopRun: string }> = {
  en: { start: 'Dictate', stop: 'Stop dictation', send: 'Send', stopRun: 'Stop' },
  ar: { start: 'إملاء صوتي', stop: 'إيقاف الإملاء', send: 'إرسال', stopRun: 'إيقاف' },
  hi: { start: 'बोलकर लिखें', stop: 'बोलना बंद करें', send: 'भेजें', stopRun: 'रोकें' },
  ur: { start: 'بول کر لکھیں', stop: 'بولنا بند کریں', send: 'بھیجیں', stopRun: 'روکیں' },
}

export function SanaChatInput({
  isRunning,
  onSubmitMessage,
  onStop,
  placeholder,
  dictationLang: langProp,
  dictation: dictationProp,
}: CopilotChatInputProps & { placeholder?: string; dictationLang?: LearnerLanguage; dictation?: boolean }) {
  const options = useContext(SanaComposerOptions)
  const lang = langProp ?? options.lang ?? 'en'
  const showMic = dictationProp ?? options.dictation ?? true
  const labels = MIC_LABEL[lang] ?? MIC_LABEL.en
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const base = useRef('')

  // A shared document: read once chosen, sent with the next message.
  const attach = options.attach
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const readSeq = useRef(0)
  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !attach) return
      const seq = ++readSeq.current
      setAttachment({ status: 'reading', name: file.name })
      try {
        const doc = await attach.read(file)
        if (seq === readSeq.current) setAttachment({ status: 'ready', name: doc.name, doc })
      } catch (e) {
        if (seq === readSeq.current)
          setAttachment({ status: 'error', name: file.name, error: e instanceof Error ? e.message : 'That file could not be read.' })
      }
      textareaRef.current?.focus({ preventScroll: true })
    },
    [attach],
  )
  const removeAttachment = useCallback(() => {
    readSeq.current++
    setAttachment(null)
  }, [])


  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [])

  const dictation = useDictation(lang, (text, final) => {
    setValue(`${base.current}${base.current ? ' ' : ''}${text}`)
    if (final) base.current = ''
    requestAnimationFrame(resize)
  })

  useEffect(() => {
    isChatInProgressRef.current = isRunning ?? false
    onChatInProgressChange.current?.(isRunning ?? false)
  }, [isRunning])

  useEffect(() => {
    copilotSendRef.current = onSubmitMessage ?? null
    return () => {
      copilotSendRef.current = null
    }
  }, [onSubmitMessage])

  const handleSend = useCallback(() => {
    const typed = value.trim()
    if (isRunning || attachment?.status === 'reading') return
    const doc = attachment?.status === 'ready' && attach ? attachment.doc : null
    if (!typed && !doc) return
    const text = doc && attach ? attach.compose(typed || attach.defaultMessage, doc) : typed
    if (doc) setAttachment(null)
    dictation.stop()
    wasStoppedRef.current = false
    setValue('')
    base.current = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    disableActivePills()
    beforeSendRef.current?.()
    onSubmitMessage?.(text)
  }, [value, isRunning, onSubmitMessage, dictation, attachment, attach])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (!isRunning) handleSend()
      }
    },
    [isRunning, handleSend],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
      resize()
    },
    [resize],
  )

  const docReady = attachment?.status === 'ready'
  const canAct = isRunning || ((value.trim().length > 0 || docReady) && attachment?.status !== 'reading')
  const basePlaceholder = placeholder ?? options.placeholder ?? chatPlaceholderRef.current ?? 'Ask Anna anything'
  const shownPlaceholder = docReady && attach ? attach.askAbout(attachment.name) : basePlaceholder

  if (options.closed) {
    return (
      <div className="sana-composer px-4 pb-4 pt-2 sm:px-8 sm:pb-[22px]">
        <p
          className="mx-auto rounded-[12px] border border-ui-line bg-ui-surface-2 px-4 py-3 text-center text-[13px] text-ui-muted"
          style={{ maxWidth: 'var(--sana-thread-max, 776px)' }}
        >
          {options.closed}
        </p>
      </div>
    )
  }

  return (
    <div className="sana-composer px-4 pb-4 pt-2 sm:px-8 sm:pb-[22px]">
      {/* Matches the thread column (--sana-thread-max), so the composer's edges
          line up with the messages above it. */}
      <div className="mx-auto" style={{ maxWidth: 'var(--sana-thread-max, 776px)' }}>
        {options.above}
        {attachment && (
          <div
            className={cn('sana-attachment', attachment.status === 'error' && 'sana-attachment--error')}
            role="status"
            aria-live="polite"
          >
            <span className="sana-attachment-icon" aria-hidden>
              {attachment.status === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" strokeWidth={1.75} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ui-text">{attachment.name}</span>
              <span className="block truncate text-xs text-ui-muted">
                {attachment.status === 'reading'
                  ? 'Reading…'
                  : attachment.status === 'error'
                    ? attachment.error
                    : [
                        'Ready',
                        attachment.doc.pages ? `${attachment.doc.pages} page${attachment.doc.pages === 1 ? '' : 's'}` : null,
                        attachment.doc.truncated ? 'Anna reads the first part' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
              </span>
            </span>
            <button type="button" className="sana-attachment-remove" onClick={removeAttachment} aria-label={`Remove ${attachment.name}`}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        <div
          className="sana-composer-box"
          onDragOver={attach ? (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() } : undefined}
          onDrop={
            attach
              ? (e) => {
                  if (!e.dataTransfer.files.length) return
                  e.preventDefault()
                  void pickFile(e.dataTransfer.files[0])
                }
              : undefined
          }
        >
          {attach && (
            <>
              <button
                type="button"
                className="sana-icon-btn sana-icon-btn--ghost"
                onClick={() => fileRef.current?.click()}
                aria-label="Share a document with Anna"
                title="Share a document (PDF, Word, TXT, MD, CSV)"
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={attach.accept}
                hidden
                onChange={(e) => {
                  void pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={shownPlaceholder}
            aria-label={shownPlaceholder}
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none min-w-0"
            style={{ fontFamily: 'inherit' }}
          />
          {showMic && dictation.supported && (
            <button
              type="button"
              className="sana-icon-btn"
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? labels.stop : labels.start}
              title={dictation.listening ? labels.stop : labels.start}
              onClick={() => {
                if (dictation.listening) dictation.stop()
                else {
                  base.current = value.trim()
                  dictation.start()
                }
              }}
            >
              <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={isRunning ? () => { wasStoppedRef.current = true; onStop?.() } : handleSend}
            disabled={!canAct}
            aria-label={isRunning ? labels.stopRun : labels.send}
            title={isRunning ? labels.stopRun : labels.send}
            className="sana-icon-btn sana-icon-btn--primary"
          >
            {isRunning ? (
              <Square className="h-3 w-3" fill="currentColor" aria-hidden />
            ) : (
              <Send className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
        {dictation.blocked && (
          <p className="mt-1.5 text-center text-xs text-ui-muted" role="status">
            Microphone access is blocked. Allow it in your browser to dictate.
          </p>
        )}
        {options.footnote && !dictation.blocked && (
          <p className="mt-2 text-center text-xs text-ui-muted select-none">{options.footnote}</p>
        )}
      </div>
    </div>
  )
}
