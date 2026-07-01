'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-path-title"
        aria-describedby="remove-path-message"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-rose-100">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <h2 id="remove-path-title" className="text-sm font-bold text-brand-text-primary leading-snug">
              Delete learning path?
            </h2>
            <p id="remove-path-message" className="text-xs text-brand-text-muted mt-1 leading-relaxed">
              {body}
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-secondary text-xs font-bold hover:bg-brand-surface-2 transition-colors border border-brand-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  )
}
