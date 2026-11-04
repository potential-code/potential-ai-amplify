'use client'

/**
 * Copy and read aloud under Anna's answers (and, where a surface supports it,
 * try again), after the Potential chat embed. Wrap a chat in
 * <SanaReplyActionsProvider> to turn them on; SanaAssistantMessage decides
 * which replies get them (finished answers, never a greeting).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Flag, Loader2, RotateCcw, Square, Volume2 } from 'lucide-react'
import { SanaReplyActions, type SanaReplyActionsRenderer } from './SanaMessages'
import { useReadAloud } from '@/components/tutor/useVoice'
import { ReportAnswerDialog } from './ReportAnswerDialog'
import { recordAiTurn } from '@/lib/aiTurns'
import type { LearnerLanguage } from '@/components/tutor/api'
import { cn } from '@/lib/utils'

export const SANA_ACTION_STRINGS: Record<
  LearnerLanguage,
  { copy: string; copied: string; listen: string; stop: string; regenerate: string; report: string; reported: string }
> = {
  en: { copy: 'Copy', copied: 'Copied', listen: 'Read aloud', stop: 'Stop reading', regenerate: 'Try again', report: 'Report this answer', reported: 'Reported' },
  ar: { copy: 'نسخ', copied: 'تم النسخ', listen: 'قراءة بصوت عالٍ', stop: 'إيقاف القراءة', regenerate: 'حاول مرة أخرى', report: 'الإبلاغ عن هذه الإجابة', reported: 'تم الإبلاغ' },
  hi: { copy: 'कॉपी करें', copied: 'कॉपी हो गया', listen: 'ज़ोर से पढ़ें', stop: 'पढ़ना रोकें', regenerate: 'फिर से कोशिश करें', report: 'इस जवाब की रिपोर्ट करें', reported: 'रिपोर्ट किया गया' },
  ur: { copy: 'کاپی کریں', copied: 'کاپی ہو گیا', listen: 'بلند آواز میں پڑھیں', stop: 'پڑھنا روکیں', regenerate: 'دوبارہ کوشش کریں', report: 'اس جواب کی رپورٹ کریں', reported: 'رپورٹ ہو گیا' },
}

export type ReadAloud = ReturnType<typeof useReadAloud>

/** Markdown to the plain text a reader would copy (and hear). */
export function replyPlainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```\w*\n?([\s\S]*?)```/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function SanaReplyButtons({
  id,
  text,
  isLast,
  lang = 'en',
  readAloud,
  onRegenerate,
  busy,
  reportSurface,
  question,
}: {
  id: string
  text: string
  isLast: boolean
  lang?: LearnerLanguage
  readAloud: ReadAloud
  /** Shown on the latest answer only, when the surface can redo a reply. */
  onRegenerate?: () => void
  busy?: boolean
  /** Which AI this is (e.g. "ask-sana"): turns on "report this answer". */
  reportSurface?: string
  /** What the learner asked, sent with a report. */
  question?: string
}) {
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  // A finished answer in a learner chat is saved for their organisation, if they have one.
  useEffect(() => {
    if (reportSurface) recordAiTurn({ surface: reportSurface, messageId: id, question, answer: text })
  }, [reportSurface, id, question, text])
  const t = SANA_ACTION_STRINGS[lang] ?? SANA_ACTION_STRINGS.en
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const plain = replyPlainText(text)
  const copy = useCallback(async () => {
    if (!(await copyText(plain))) return
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }, [plain])

  const loading = readAloud.loadingId === id
  const playing = readAloud.playingId === id
  const speak = () => (loading || playing ? readAloud.stop() : void readAloud.play(id, plain))

  if (!plain) return null
  return (
    <>
      <button type="button" className="sana-action" onClick={copy} aria-label={copied ? t.copied : t.copy} title={copied ? t.copied : t.copy}>
        {copied ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
      </button>
      <button
        type="button"
        className={cn('sana-action', (loading || playing) && 'is-on')}
        onClick={speak}
        aria-pressed={loading || playing}
        aria-label={loading || playing ? t.stop : t.listen}
        title={loading || playing ? t.stop : t.listen}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : playing ? (
          <Square className="h-3 w-3" fill="currentColor" aria-hidden />
        ) : (
          <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {isLast && onRegenerate && (
        <button type="button" className="sana-action" onClick={onRegenerate} disabled={busy} aria-label={t.regenerate} title={t.regenerate}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {reportSurface && (
        <>
          <button
            type="button"
            className={cn('sana-action', reported && 'is-on')}
            onClick={() => setReporting(true)}
            disabled={reported}
            aria-label={reported ? t.reported : t.report}
            title={reported ? t.reported : t.report}
          >
            <Flag className="h-4 w-4" strokeWidth={1.75} fill={reported ? 'currentColor' : 'none'} aria-hidden />
          </button>
          <ReportAnswerDialog
            open={reporting}
            onClose={() => setReporting(false)}
            onSent={() => setReported(true)}
            surface={reportSurface}
            reply={plain}
            question={question}
          />
        </>
      )}
    </>
  )
}

/** Copy and read aloud under every finished answer in this chat. */
export function SanaReplyActionsProvider({
  children,
  lang = 'en',
  reportSurface,
}: {
  children: ReactNode
  lang?: LearnerLanguage
  /** Which AI this chat is (e.g. "examiner"); turns on "report this answer". Off for admins' own tools. */
  reportSurface?: string
}) {
  const readAloud = useReadAloud()
  const render = useMemo<SanaReplyActionsRenderer>(
    () => (reply) => <SanaReplyButtons {...reply} lang={lang} readAloud={readAloud} reportSurface={reportSurface} />,
    [lang, readAloud, reportSurface],
  )
  return <SanaReplyActions.Provider value={render}>{children}</SanaReplyActions.Provider>
}
