'use client'

/**
 * AI safety: answers learners reported (from Ask Anna, the learning journeys
 * and the AI mentors). Read the question
 * and the answer, note what was done, and mark it reviewed or dismiss it.
 * Reported text is shown as plain text, never rendered.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Flag, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { btn, Card, EmptyState, FilterChips, inputClass, PageHeader, Skeleton } from '@/components/kit'
import { IconButton, Pill, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type Status = 'open' | 'reviewed' | 'dismissed'
type Report = {
  id: string
  surface: string
  surfaceLabel: string
  reason: string
  reasonLabel: string
  note: string | null
  reply: string
  question: string | null
  page: string | null
  status: Status
  adminNote: string | null
  reviewerName: string | null
  reviewedAt: string | null
  createdAt: string
  reporterName: string | null
  reporterEmail: string | null
}
type Data = { counts: Record<Status, number>; reports: Report[] }

const REASON_TONE: Record<string, 'danger' | 'brand' | 'line'> = { harmful: 'danger', inappropriate: 'danger', wrong: 'brand' }
const when = (iso: string) => `${fmtDate(iso)}, ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`

function Detail({ report, onClose }: { report: Report; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(report.adminNote ?? '')
  const save = useMutation({
    mutationFn: (status: Status) => apiFetch(`/api/admin/ai-reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status, adminNote: note.trim() || null }) }),
    onSuccess: (_d, status) => {
      toast.success(status === 'reviewed' ? 'Marked reviewed' : status === 'dismissed' ? 'Report dismissed' : 'Report reopened')
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-reports'] })
      onClose()
    },
    onError: () => toast.error('That didn’t save. Try again.'),
  })

  return (
    <aside aria-labelledby="rep-title" className="flex flex-col rounded-[14px] border border-ui-line bg-ui-surface xl:sticky xl:top-6">
      <div className="flex items-start gap-2.5 border-b border-ui-line px-[18px] py-3.5">
        <div className="min-w-0 flex-1">
          <h2 id="rep-title" className="text-base font-semibold text-ui-text">
            {report.reasonLabel}
          </h2>
          <p className="text-xs text-ui-muted">
            {report.surfaceLabel} · {when(report.createdAt)}
          </p>
        </div>
        <IconButton label="Close" icon={X} onClick={onClose} className="-mr-1.5" />
      </div>
      <div className="flex flex-col gap-4 px-[18px] py-4">
        <div>
          <p className="text-xs font-semibold text-ui-muted">Reported by</p>
          <p className="text-sm text-ui-text">
            {report.reporterName ?? 'Deleted account'}
            {report.reporterEmail && <span className="text-ui-muted"> · {report.reporterEmail}</span>}
          </p>
          {report.page && <p className="mt-0.5 font-mono text-xs text-ui-muted">{report.page}</p>}
        </div>
        {report.note && (
          <div>
            <p className="text-xs font-semibold text-ui-muted">What the learner said</p>
            <p className="whitespace-pre-wrap text-sm text-ui-text">{report.note}</p>
          </div>
        )}
        {report.question && (
          <div>
            <p className="text-xs font-semibold text-ui-muted">Question</p>
            <p className="whitespace-pre-wrap rounded-[10px] bg-ui-surface-2 px-3 py-2 text-sm text-ui-text">{report.question}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-ui-muted">AI answer</p>
          <p className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-ui-line px-3 py-2 text-sm leading-relaxed text-ui-text">{report.reply}</p>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-ui-muted">Your note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className={cn(inputClass, 'mt-1 h-auto min-h-[72px] py-2')} placeholder="What was done, e.g. mentor prompt corrected" />
        </label>
        {report.status !== 'open' && report.reviewerName && (
          <p className="text-xs text-ui-muted">
            {report.status === 'reviewed' ? 'Reviewed' : 'Dismissed'} by {report.reviewerName}
            {report.reviewedAt ? ` on ${fmtDate(report.reviewedAt)}` : ''}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-ui-line px-[18px] py-3">
        {report.status === 'open' ? (
          <>
            <button type="button" className={btn({ variant: 'secondary' })} onClick={() => save.mutate('dismissed')} disabled={save.isPending}>
              Dismiss
            </button>
            <button type="button" className={btn()} onClick={() => save.mutate('reviewed')} disabled={save.isPending}>
              <Check className="h-4 w-4" aria-hidden />
              Mark reviewed
            </button>
          </>
        ) : (
          <>
            <button type="button" className={btn({ variant: 'secondary' })} onClick={() => save.mutate('open')} disabled={save.isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reopen
            </button>
            <button type="button" className={btn()} onClick={() => save.mutate(report.status)} disabled={save.isPending}>
              Save note
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

export default function AiSafetyPage() {
  const [status, setStatus] = useState<Status>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ai-reports', status],
    queryFn: () => apiFetch<{ data: Data }>(`/api/admin/ai-reports?status=${status}`).then((r) => r.data),
  })
  const selected = data?.reports.find((r) => r.id === selectedId) ?? null
  const counts = data?.counts

  return (
    <AdminLayout>
      <PageHeader
        title="AI safety"
        subtitle="Answers learners reported from Ask Anna, the learning journeys and the AI mentors."
      />
      <FilterChips<Status>
        label="Filter reports"
        className="mb-4"
        active={status}
        onChange={(v) => {
          setStatus(v)
          setSelectedId(null)
        }}
        options={[
          { value: 'open', label: 'Open', count: counts?.open },
          { value: 'reviewed', label: 'Reviewed', count: counts?.reviewed },
          { value: 'dismissed', label: 'Dismissed', count: counts?.dismissed },
        ]}
      />
      <div className={cn('grid items-start gap-5', selected && 'xl:grid-cols-[minmax(0,1fr)_420px]')}>
        <TableCard>
          {isLoading ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !data?.reports.length ? (
            <EmptyState
              icon={status === 'open' ? ShieldCheck : Flag}
              title={status === 'open' ? 'Nothing to review' : `No ${status} reports`}
              body={status === 'open' ? 'When a learner reports an AI answer, it appears here and you get a notification.' : undefined}
            />
          ) : (
            <table className={cn(adminTableClass, 'min-w-[640px]')} aria-label="Reports">
              <thead>
                <tr>
                  <th>Reported</th>
                  <th>Where</th>
                  <th>Reason</th>
                  <th>Answer</th>
                  <th>Learner</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr key={r.id} aria-selected={selectedId === r.id || undefined} className={cn('cursor-pointer', selectedId === r.id && '!bg-ui-brand-soft')} onClick={() => setSelectedId(r.id)}>
                    <td className="whitespace-nowrap text-ui-muted">{fmtDate(r.createdAt)}</td>
                    <td className="whitespace-nowrap">{r.surfaceLabel}</td>
                    <td>
                      <Pill tone={REASON_TONE[r.reason] ?? 'line'}>{r.reasonLabel}</Pill>
                    </td>
                    <td className="max-w-[320px]">
                      <button type="button" className="block w-full truncate text-left text-ui-text hover:underline" onClick={() => setSelectedId(r.id)} aria-label={`Open report: ${r.reasonLabel}, ${r.surfaceLabel}`}>
                        {r.reply}
                      </button>
                    </td>
                    <td className="whitespace-nowrap text-ui-muted">{r.reporterName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
        {selected && <Detail key={selected.id} report={selected} onClose={() => setSelectedId(null)} />}
      </div>
      {status === 'open' && !!data?.reports.length && (
        <Card className="mt-4 px-5 py-3 text-[13px] text-ui-muted">
          Mentor answers come from the bots on PotentialDashboard: fix a recurring problem in that mentor&rsquo;s prompt there. Anna&rsquo;s instructions are part of AI Amplify&rsquo;s code (shared/anna/prompts.ts), so the development team changes those.
        </Card>
      )}
    </AdminLayout>
  )
}
