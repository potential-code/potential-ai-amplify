'use client'

import { useEffect } from 'react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { Sparkles, Loader2 } from 'lucide-react'

interface RegeneratePathDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  loading: boolean
  /** Extra context when the path is stale (catalog updated since built). */
  stale?: boolean
}

/**
 * Confirmation for rebuilding a learning path in place. Unlike deletion this
 * is non-destructive: progress is kept (completed blocks are preserved and
 * inform the new selection) and the old path is archived, not removed.
 */
export function RegeneratePathDialog({
  open,
  onClose,
  onConfirm,
  loading,
  stale = false,
}: RegeneratePathDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  if (!open) return null

  const body = stale
    ? 'The course catalog has been updated since your path was built. Anna will rebuild it from the latest content, using your original answers and everything you have completed so far. Your progress is kept.'
    : 'Anna will rebuild your path using your original answers, your progress so far, and the latest course content. Completed blocks stay completed, so nothing is lost.'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-ui-line bg-ui-surface p-6 text-ui-text shadow-ui"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="regen-path-title"
        aria-describedby="regen-path-message"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-ui-brand-soft">
            <Sparkles className="w-4 h-4 text-ui-brand-text" aria-hidden />
          </div>
          <div>
            <h2 id="regen-path-title" className="text-base font-semibold leading-snug text-ui-text">
              Update your learning path?
            </h2>
            <p id="regen-path-message" className="mt-1 text-sm leading-relaxed text-ui-muted">
              {body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={btn({ variant: 'secondary', size: 'md' })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={cn(btn({ variant: 'primary', size: 'md' }))}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Update path
          </button>
        </div>
      </div>
    </div>
  )
}
