'use client'

import { useEffect } from 'react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface RemoveLearningPathDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  loading: boolean
  includeQuestionnaireNote?: boolean
}

export function RemoveLearningPathDialog({
  open,
  onClose,
  onConfirm,
  loading,
  includeQuestionnaireNote = false,
}: RemoveLearningPathDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  if (!open) return null

  const body = includeQuestionnaireNote
    ? "This will permanently delete your learning path and all progress. You'll need to complete the questionnaire again to generate a new one."
    : 'This will permanently delete your learning path and all progress. This cannot be undone.'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-ui-line bg-ui-surface p-6 text-ui-text shadow-ui"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-path-title"
        aria-describedby="remove-path-message"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-ui-danger-soft">
            <AlertTriangle className="w-4 h-4 text-ui-danger" aria-hidden />
          </div>
          <div>
            <h2 id="remove-path-title" className="text-base font-semibold leading-snug text-ui-text">
              Delete learning path?
            </h2>
            <p id="remove-path-message" className="mt-1 text-sm leading-relaxed text-ui-muted">
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
            className={cn(btn({ variant: 'danger', size: 'md' }))}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
