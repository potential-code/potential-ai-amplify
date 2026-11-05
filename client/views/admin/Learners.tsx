'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Eraser, GraduationCap, Loader2, RefreshCw, RotateCcw, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Avatar, Button, EmptyState, FilterChips, PageHeader, Skeleton } from '@/components/kit'
import { IconButton, Pill, SearchInput, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { RegenerateSetupCard } from '@/components/admin/RegenerateSetupCard'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { countryName } from '@/lib/countryName'
import { ExportMenu } from '@/components/admin/ExportMenu'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Learner {
  id: string
  fullName: string
  email: string
  country: string | null
  avatarUrl: string | null
  createdAt: string
  lastActiveAt: string | null
  hasQuestionnaire: boolean
  hasActivePath: boolean
  pathGeneratedAt: string | null
  blocksCompleted: number
  blocksInProgress: number
}

type PendingAction = 'reset-progress' | 'regenerate-path' | 'reset-path'
type StatusFilter = 'all' | 'active' | 'onboarded' | 'not-started'

interface PendingConfirm {
  userId: string
  action: PendingAction
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pathStatus(l: Learner): Exclude<StatusFilter, 'all'> {
  if (l.hasActivePath) return 'active'
  if (l.hasQuestionnaire) return 'onboarded'
  return 'not-started'
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return fmtDate(date)
}

const ACTIONS: Record<
  PendingAction,
  { title: string; message: string; confirmLabel: string; panelText: string; icon: LucideIcon; tone: 'danger' | 'primary' }
> = {
  'reset-progress': {
    title: 'Reset progress',
    message: "This clears all of this learner's course/block progress. Their learning path stays. This cannot be undone.",
    confirmLabel: 'Reset progress',
    panelText: "Clears all of this learner's course and block progress. Their learning path stays. This cannot be undone.",
    icon: RotateCcw,
    tone: 'danger',
  },
  'regenerate-path': {
    title: 'Regenerate learning path',
    message: "This rebuilds the learner's path from their existing answers and archives the current path.",
    confirmLabel: 'Regenerate',
    panelText: "Rebuilds the learner's path from their existing answers and archives the current path.",
    icon: RefreshCw,
    tone: 'primary',
  },
  'reset-path': {
    title: 'Reset learning path',
    message:
      "This deletes the learner's path AND their initial form answers, returning them to onboarding. This cannot be undone.",
    confirmLabel: 'Reset path',
    panelText: "Deletes the learner's path and their initial form answers, returning them to onboarding. This cannot be undone.",
    icon: Eraser,
    tone: 'danger',
  },
}

const ACTION_ORDER: PendingAction[] = ['reset-progress', 'regenerate-path', 'reset-path']
const ACTION_BUTTON: Record<PendingAction, string> = {
  'reset-progress': 'Reset progress',
  'regenerate-path': 'Regenerate',
  'reset-path': 'Reset path',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PathStatusPill({ learner }: { learner: Learner }) {
  const s = pathStatus(learner)
  if (s === 'active') return <Pill tone="brand" dot>Active path</Pill>
  if (s === 'onboarded') return <Pill tone="neutral">Onboarded</Pill>
  return <Pill tone="line">Not started</Pill>
}

function ProgressText({ learner }: { learner: Learner }) {
  if (learner.blocksCompleted === 0 && learner.blocksInProgress === 0) {
    return <span className="text-ui-muted">No progress</span>
  }
  return (
    <>
      <strong className="font-semibold text-ui-text">{learner.blocksCompleted}</strong>{' '}
      <span className="text-ui-muted">{learner.blocksCompleted === 1 ? 'block done' : 'blocks done'}</span>
      {learner.blocksInProgress > 0 && <span className="text-ui-muted">, {learner.blocksInProgress} in progress</span>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function LearnersView() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const { data: learners = [], isLoading, isError } = useQuery<Learner[]>({
    queryKey: ['admin', 'learners'],
    queryFn: () =>
      apiFetch<{ success: boolean; data: Learner[] }>('/api/lms/learning/admin/learners').then((r) => r.data),
  })

  const counts = useMemo(() => {
    const c = { all: learners.length, active: 0, onboarded: 0, 'not-started': 0 }
    for (const l of learners) c[pathStatus(l)]++
    return c
  }, [learners])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return learners.filter(
      (l) =>
        (status === 'all' || pathStatus(l) === status) &&
        (!q || l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)),
    )
  }, [learners, search, status])

  // Keep a learner selected for the detail panel: the clicked one while it is
  // visible, otherwise the first row of the current list.
  const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  const resetProgressMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ success: boolean; data: { cleared: number } }>(
        `/api/lms/learning/admin/learners/${userId}/reset-progress`,
        { method: 'POST' },
      ),
    onSuccess: (data, userId) => {
      toast.success(`Progress reset, ${data.data.cleared} block(s) cleared`)
      qc.invalidateQueries({ queryKey: ['admin', 'learners'] })
      setPendingId((p) => (p === userId ? null : p))
    },
    onError: (err: unknown, userId) => {
      const body = err as { error?: string } | null
      toast.error(body?.error ?? 'Failed to reset progress')
      setPendingId((p) => (p === userId ? null : p))
    },
  })

  const regeneratePathMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/lms/learning/admin/learners/${userId}/regenerate-path`, { method: 'POST' }),
    onSuccess: (_data, userId) => {
      toast.success('Learning path regenerated')
      qc.invalidateQueries({ queryKey: ['admin', 'learners'] })
      setPendingId((p) => (p === userId ? null : p))
    },
    onError: (err: unknown, userId) => {
      const body = err as { error?: string; status?: number } | null
      if (body?.status === 400 || body?.error?.toLowerCase().includes('answer')) {
        toast.error("Learner hasn't completed the intake form")
      } else {
        toast.error(body?.error ?? 'Failed to regenerate learning path')
      }
      setPendingId((p) => (p === userId ? null : p))
    },
  })

  const resetPathMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/lms/learning/admin/learners/${userId}/reset-path`, { method: 'POST' }),
    onSuccess: (_data, userId) => {
      toast.success('Learning path and form answers reset')
      qc.invalidateQueries({ queryKey: ['admin', 'learners'] })
      setPendingId((p) => (p === userId ? null : p))
    },
    onError: (err: unknown, userId) => {
      const body = err as { error?: string } | null
      toast.error(body?.error ?? 'Failed to reset learning path')
      setPendingId((p) => (p === userId ? null : p))
    },
  })

  const mutationFor: Record<PendingAction, { variables?: string }> = {
    'reset-progress': resetProgressMutation,
    'regenerate-path': regeneratePathMutation,
    'reset-path': resetPathMutation,
  }

  function isRunning(userId: string, action: PendingAction) {
    return pendingId === userId && mutationFor[action].variables === userId
  }

  function handleConfirm() {
    if (!pendingConfirm) return
    const { userId, action } = pendingConfirm
    setPendingConfirm(null)
    setPendingId(userId)
    if (action === 'reset-progress') resetProgressMutation.mutate(userId)
    else if (action === 'regenerate-path') regeneratePathMutation.mutate(userId)
    else if (action === 'reset-path') resetPathMutation.mutate(userId)
  }

  const activeConfig = pendingConfirm ? ACTIONS[pendingConfirm.action] : null
  const filterOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'active', label: 'Active path', count: counts.active },
    { value: 'onboarded', label: 'Onboarded', count: counts.onboarded },
    { value: 'not-started', label: 'Not started', count: counts['not-started'] },
  ]

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Learners"
          subtitle="Manage learners’ AI learning paths and progress."
          className="mb-0"
          actions={<ExportMenu datasets={['learners', 'course-progress', 'learning-gain', 'certificates']} />}
        />

        {/* Toolbar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterChips<StatusFilter> label="Filter by path status" options={filterOptions} active={status} onChange={setStatus} className="min-w-0" />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or email"
            label="Search learners"
            className="md:w-[280px] md:shrink-0"
          />
        </div>

        {/* Below 1440px the detail panel narrows and "Last active" moves to it,
            so the Actions column always fits beside the panel. */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px] min-[1440px]:grid-cols-[minmax(0,1fr)_320px]">
          <TableCard
            footer={
              !isLoading && !isError && filtered.length > 0
                ? filtered.length === learners.length
                  ? `${learners.length} ${learners.length === 1 ? 'learner' : 'learners'}`
                  : `${filtered.length} of ${learners.length} learners`
                : undefined
            }
          >
            {isLoading ? (
              <div className="flex flex-col gap-3 p-5" aria-label="Loading learners">
                {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : isError ? (
              <EmptyState icon={AlertCircle} title="Failed to load learners" body="Refresh the page to try again." />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title={search || status !== 'all' ? 'No learners match' : 'No learners yet'}
                body={search || status !== 'all' ? 'Try another search or filter.' : 'Learners appear here once they sign up.'}
              />
            ) : (
              <table className={cn(adminTableClass, 'min-w-[540px] min-[1440px]:min-w-[640px]')}>
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col" className="hidden min-[1560px]:table-cell">Country</th>
                    <th scope="col">Path status</th>
                    <th scope="col">Progress</th>
                    <th scope="col" className="hidden min-[1440px]:table-cell">Last active</th>
                    <th scope="col" className="!text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((learner) => {
                    const rowPending = pendingId === learner.id
                    const isSelected = selected?.id === learner.id
                    return (
                      <tr
                        key={learner.id}
                        data-selected={isSelected || undefined}
                        onClick={() => setSelectedId(learner.id)}
                        className={cn('cursor-pointer', isSelected && '!bg-ui-brand-soft')}
                      >
                        <td>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={learner.fullName} src={learner.avatarUrl} size={32} />
                            <div className="flex min-w-0 flex-col">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedId(learner.id)
                                }}
                                aria-pressed={isSelected}
                                className="truncate text-left font-semibold text-ui-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
                              >
                                {learner.fullName}
                              </button>
                              <span className="truncate text-xs text-ui-muted">{learner.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="hidden text-ui-muted min-[1560px]:table-cell">{countryName(learner.country) || 'Not set'}</td>
                        <td>
                          <PathStatusPill learner={learner} />
                        </td>
                        <td className="text-[13px] min-[1440px]:whitespace-nowrap">
                          <ProgressText learner={learner} />
                        </td>
                        <td className="hidden whitespace-nowrap text-[13px] text-ui-muted min-[1440px]:table-cell">{formatRelativeDate(learner.lastActiveAt)}</td>
                        <td>
                          <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                            {ACTION_ORDER.map((action) => {
                              const running = isRunning(learner.id, action)
                              const noIntake = action === 'regenerate-path' && !learner.hasQuestionnaire
                              return (
                                <IconButton
                                  key={action}
                                  icon={running ? Loader2 : ACTIONS[action].icon}
                                  label={`${ACTIONS[action].title} for ${learner.fullName}`}
                                  title={noIntake ? 'No intake form responses to regenerate from' : ACTIONS[action].title}
                                  tone={action === 'reset-path' ? 'danger' : 'default'}
                                  disabled={rowPending || noIntake}
                                  className={cn(running && '[&_svg]:animate-spin')}
                                  onClick={() => setPendingConfirm({ userId: learner.id, action })}
                                />
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </TableCard>

          {/* Detail panel for the selected learner */}
          {selected && !isLoading && !isError && (
            <aside aria-labelledby="learner-detail-name" className="rounded-[14px] border border-ui-line bg-ui-surface px-5 pb-1.5 pt-[18px]">
              <div className="flex items-center gap-3">
                <Avatar name={selected.fullName} src={selected.avatarUrl} size={44} />
                <div className="min-w-0">
                  <h2 id="learner-detail-name" className="truncate text-base font-semibold text-ui-text">{selected.fullName}</h2>
                  <p className="truncate text-[13px] text-ui-muted">{selected.email}</p>
                </div>
              </div>
              <dl className="my-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-ui-muted">Path status</dt>
                <dd><PathStatusPill learner={selected} /></dd>
                <dt className="text-ui-muted">Path generated</dt>
                <dd className="text-ui-text">{selected.pathGeneratedAt ? fmtDate(selected.pathGeneratedAt) : 'Not generated'}</dd>
                <dt className="text-ui-muted">Intake form</dt>
                <dd className="text-ui-text">{selected.hasQuestionnaire ? 'Completed' : 'Not completed'}</dd>
                <dt className="text-ui-muted">Blocks done</dt>
                <dd className="text-ui-text">
                  {selected.blocksCompleted} done, {selected.blocksInProgress} in progress
                </dd>
                <dt className="text-ui-muted">Country</dt>
                <dd className="text-ui-text">{countryName(selected.country) || 'Not set'}</dd>
                <dt className="text-ui-muted">Last active</dt>
                <dd className="text-ui-text">{selected.lastActiveAt ? fmtDate(selected.lastActiveAt) : 'Never'}</dd>
                <dt className="text-ui-muted">Joined</dt>
                <dd className="text-ui-text">{fmtDate(selected.createdAt)}</dd>
              </dl>
              {ACTION_ORDER.map((action) => {
                const cfg = ACTIONS[action]
                const Icon = cfg.icon
                const running = isRunning(selected.id, action)
                const noIntake = action === 'regenerate-path' && !selected.hasQuestionnaire
                return (
                  <div key={action} className="flex flex-col gap-2 border-t border-ui-line py-3.5">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ui-text">
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      {cfg.title}
                    </h3>
                    <p className="text-[13px] leading-normal text-ui-muted">
                      {noIntake ? 'Not available: this learner has no intake form responses to regenerate from.' : cfg.panelText}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      disabled={pendingId === selected.id || noIntake}
                      onClick={() => setPendingConfirm({ userId: selected.id, action })}
                    >
                      {running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                      {ACTION_BUTTON[action]}
                    </Button>
                  </div>
                )
              })}
            </aside>
          )}
        </div>
      </div>

      <RegenerateSetupCard />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!pendingConfirm}
        title={activeConfig?.title ?? ''}
        message={activeConfig?.message ?? ''}
        confirmLabel={activeConfig?.confirmLabel}
        tone={activeConfig?.tone}
        onConfirm={handleConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </AdminLayout>
  )
}
