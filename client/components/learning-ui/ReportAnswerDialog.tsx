'use client'

/**
 * "Report this answer": a learner tells the AI Amplify team an AI answer was wrong,
 * harmful, inappropriate or unhelpful. It goes to Admin → AI safety with the
 * answer, the question before it and the chat it came from.
 */
import { useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/admin/ui'
import { btn, inputClass } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

const REASONS = [
  { value: 'wrong', label: 'Wrong or misleading', hint: 'A fact, figure or step is incorrect' },
  { value: 'harmful', label: 'Harmful or unsafe', hint: 'Advice that could hurt someone or their business' },
  { value: 'inappropriate', label: 'Inappropriate', hint: 'Offensive, biased or not suitable' },
  { value: 'unhelpful', label: 'Not helpful', hint: 'Off topic or didn’t answer the question' },
  { value: 'other', label: 'Something else', hint: '' },
] as const

export function ReportAnswerDialog({
  open,
  onClose,
  onSent,
  surface,
  reply,
  question,
}: {
  open: boolean
  onClose: () => void
  onSent: () => void
  surface: string
  reply: string
  question?: string
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number]['value'] | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const name = useId()

  async function send() {
    if (!reason) return
    setSending(true)
    try {
      await apiFetch('/api/ai-reports', {
        method: 'POST',
        body: JSON.stringify({ surface, reason, note: note.trim() || null, reply, question: question ?? null, page: window.location.pathname }),
      })
      toast.success('Thanks for telling us', { description: 'The AI Amplify team will review this answer.' })
      onSent()
      onClose()
      setReason(null)
      setNote('')
    } catch (e) {
      toast.error((e as { error?: { message?: string } } | null)?.error?.message ?? 'That didn’t send. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      size="sm"
      title="Report this answer"
      description="What’s wrong with it? The AI Amplify team reviews every report."
      onClose={sending ? () => {} : onClose}
      footer={
        <>
          <button type="button" className={btn({ variant: 'secondary' })} onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" className={btn()} onClick={send} disabled={!reason || sending}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Send report
          </button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Reason</legend>
        {REASONS.map((r) => (
          <label
            key={r.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 transition-colors',
              reason === r.value ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line hover:bg-ui-surface-2',
            )}
          >
            <input type="radio" name={name} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1 h-4 w-4 accent-[var(--ui-brand)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ui-text">{r.label}</span>
              {r.hint && <span className="block text-xs text-ui-muted">{r.hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block">
        <span className="text-sm font-medium text-ui-text">
          Anything to add? <span className="font-normal text-ui-muted">(optional)</span>
        </span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={cn(inputClass, 'mt-1 h-auto min-h-[76px] py-2')} placeholder="e.g. VAT in the UAE is 5%, not 20%." />
      </label>
    </Modal>
  )
}
