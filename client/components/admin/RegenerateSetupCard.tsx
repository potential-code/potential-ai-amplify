'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, Route } from 'lucide-react'
import { toast } from 'sonner'
import { btn } from '@/components/kit'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { apiRegenerateLearningSetupAll } from '@/lib/api/lms'

/**
 * Rebuilds the AI learning-path setup for the whole platform and resets every
 * learner's active path. Lives on the Learners page, not an admin's profile.
 */
export function RegenerateSetupCard() {
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)
  const [regenRunning, setRegenRunning] = useState(false)

  function handleRegenConfirm() {
    setRegenConfirmOpen(false)
    setRegenRunning(true)
    apiRegenerateLearningSetupAll()
      .then((d) => {
        toast.success(`Regenerated ${d.themeCount} themes and ${d.questionCount} questions, ${d.pathsCleared} paths reset`)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to regenerate learning setup')
      })
      .finally(() => setRegenRunning(false))
  }

  return (
    <>
      <section aria-labelledby="h-regen" className="mt-6 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
            <Route className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="h-regen" className="text-base font-semibold text-ui-text">Learning path setup for all learners</h2>
            <p className="mt-0.5 text-[13px] text-ui-muted">Rebuild the global learning setup from the current course catalog.</p>
          </div>
        </div>
        <p className="mt-3 max-w-[75ch] text-sm leading-relaxed text-ui-muted">
          Regenerating rebuilds all themes and intake questions from the current course catalog using AI, then resets
          every learner&apos;s active path so they receive a fresh one on next visit. Completed blocks are preserved
          server-side. This can take <strong className="font-semibold text-ui-text">up to 15 minutes</strong> to complete.
        </p>
        {regenRunning && (
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ui-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ui-brand" aria-hidden />
            Regeneration in progress. This may take several minutes; you can leave this page.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={regenRunning}
            onClick={() => setRegenConfirmOpen(true)}
            className={btn({ variant: 'secondary' })}
          >
            {regenRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {regenRunning ? 'Regenerating' : 'Regenerate learning path setup'}
          </button>
          <span className="text-xs text-ui-muted">Asks for confirmation first.</span>
        </div>
      </section>

      <ConfirmDialog
        open={regenConfirmOpen}
        title="Regenerate learning path setup"
        message="This rebuilds all AI themes and intake questions from the current course catalog and resets every learner's active path. Completed blocks are preserved. The AI run takes up to 15 minutes. Continue?"
        confirmLabel="Regenerate"
        onConfirm={handleRegenConfirm}
        onCancel={() => setRegenConfirmOpen(false)}
      />
    </>
  )
}
