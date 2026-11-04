'use client'

/**
 * "Export": the platform's records as CSV or Excel (GET /api/admin/exports/:dataset,
 * or another endpoint with the same contract, e.g. one organisation's).
 * A small menu of datasets, each with a CSV and an Excel download.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'

export type ExportDataset = 'learners' | 'course-progress' | 'learning-gain' | 'certificates' | 'redemptions' | 'mentor-sessions'

const DATASETS: Record<ExportDataset, { label: string; hint: string }> = {
  learners: { label: 'Learners', hint: 'Profile, activity, courses, certificates, points' },
  'course-progress': { label: 'Course progress', hint: 'Each learner and course: progress, scores, certificate' },
  'learning-gain': { label: 'Learning gain', hint: 'Pre-test vs final exam, per learner and course' },
  certificates: { label: 'Certificates', hint: 'Every certificate issued' },
  redemptions: { label: 'Offer redemptions', hint: 'Points used and amounts paid' },
  'mentor-sessions': { label: 'Mentor sessions', hint: 'Bookings, times and status' },
}

async function download(endpoint: string, dataset: ExportDataset, format: 'csv' | 'xlsx') {
  const res = await fetch(`${endpoint}/${dataset}?format=${format}`, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`export ${res.status}`)
  const name =
    res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `ai-amplify-${dataset}.${format}`
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return Number(res.headers.get('x-row-count') ?? 0)
}

export function ExportMenu({
  datasets = Object.keys(DATASETS) as ExportDataset[],
  align = 'end',
  endpoint = '/api/admin/exports',
}: {
  datasets?: ExportDataset[]
  align?: 'start' | 'end'
  /** Where the files come from (default: the whole platform's admin exports). */
  endpoint?: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = async (dataset: ExportDataset, format: 'csv' | 'xlsx') => {
    const key = `${dataset}.${format}`
    setBusy(key)
    // Close once chosen; the button shows progress and a toast confirms.
    setOpen(false)
    triggerRef.current?.focus()
    try {
      const n = await download(endpoint, dataset, format)
      toast.success(`${DATASETS[dataset].label} exported`, { description: `${n} row${n === 1 ? '' : 's'}` })
    } catch {
      toast.error('That export didn’t download. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 2 : e.key === 'ArrowUp' ? -2 : e.key === 'ArrowRight' ? 1 : -1
    items[(i + step + items.length) % items.length]?.focus()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        disabled={busy !== null}
        className={cn(btn({ variant: 'secondary' }), 'h-9')}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        {busy ? 'Exporting…' : 'Export'}
        <ChevronDown className={cn('h-4 w-4 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label="Export data"
          onKeyDown={onMenuKey}
          className={cn(
            'absolute top-[calc(100%+6px)] z-40 w-[400px] max-w-[calc(100vw-2rem)] rounded-[14px] border border-ui-line bg-ui-surface p-1.5 shadow-ui',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-semibold text-ui-muted">Download as a spreadsheet</p>
          {datasets.map((d) => (
            <div key={d} className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-ui-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ui-text">{DATASETS[d].label}</span>
                <span className="line-clamp-2 block text-xs text-ui-muted">{DATASETS[d].hint}</span>
              </span>
              {(['xlsx', 'csv'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="menuitem"
                  disabled={busy !== null}
                  onClick={() => void run(d, f)}
                  aria-label={`${DATASETS[d].label} as ${f === 'xlsx' ? 'Excel' : 'CSV'}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-ui-line bg-ui-surface px-2 text-xs font-semibold text-ui-text transition-colors hover:border-ui-brand hover:text-ui-brand-text focus-visible:outline-2 focus-visible:outline-ui-brand disabled:opacity-50"
                >
                  {busy === `${d}.${f}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : f === 'xlsx' ? (
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {f === 'xlsx' ? 'Excel' : 'CSV'}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
