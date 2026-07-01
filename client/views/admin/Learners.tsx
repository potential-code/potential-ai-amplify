'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Loader2,
  AlertCircle,
  GraduationCap,
  RotateCcw,
  RefreshCw,
  Eraser,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { apiFetch } from '@/lib/api'

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

interface PendingConfirm {
  userId: string
  action: PendingAction
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dicebearAvatar(fullName: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}&backgroundColor=9f2063&fontSize=42&radius=50`
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PathStatusBadge({ learner }: { learner: Learner }) {
  if (learner.hasActivePath) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
        Active path
      </span>
    )
  }
  if (learner.hasQuestionnaire) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-surface-2 text-brand-text-secondary">
        Onboarded
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
      Not started
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function LearnersView() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const { data: learners = [], isLoading, isError } = useQuery<Learner[]>({
    queryKey: ['admin', 'learners'],
    queryFn: () =>
      apiFetch<{ success: boolean; data: Learner[] }>('/api/lms/learning/admin/learners').then(
        (r) => r.data,
      ),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return learners
    return learners.filter(
      (l) =>
        l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q),
    )
  }, [learners, search])

  const resetProgressMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ success: boolean; data: { cleared: number } }>(
        `/api/lms/learning/admin/learners/${userId}/reset-progress`,
        { method: 'POST' },
      ),
    onSuccess: (data, userId) => {
      toast.success(`Progress reset — ${data.data.cleared} block(s) cleared`)
      qc.invalidateQueries({ queryKey: ['admin', 'learners'] })
      if (pendingId === userId) setPendingId(null)
    },
    onError: (err: unknown, userId) => {
      const body = err as { error?: string } | null
      toast.error(body?.error ?? 'Failed to reset progress')
      if (pendingId === userId) setPendingId(null)
    },
  })

  const regeneratePathMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/lms/learning/admin/learners/${userId}/regenerate-path`, { method: 'POST' }),
    onSuccess: (_data, userId) => {
      toast.success('Learning path regenerated')
      qc.invalidateQueries({ queryKey: ['admin', 'learners'] })
      if (pendingId === userId) setPendingId(null)
    },
    onError: (err: unknown, userId) => {
      const body = err as { error?: string; status?: number } | null
      if ((body as { status?: number })?.status === 400 || (body as { error?: string })?.error?.toLowerCase().includes('answer')) {
        toast.error("Learner hasn't completed the intake form")
      } else {
        toast.error(body?.error ?? 'Failed to regenerate learning path')
      }
      if (pendingId === userId) setPendingId(null)
    },
  })

  const resetPathMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/lms/learning/admin/learners/${userId}/reset-path`, { method: 'POST' }),
    onSuccess: (_data, userId) => {
      toast.success('Learning path and form answers reset')
      qc.invalidateQueries({ queryKey: ['admin', 'learners'] })
      if (pendingId === userId) setPendingId(null)
    },
    onError: (err: unknown, userId) => {
      const body = err as { error?: string } | null
      toast.error(body?.error ?? 'Failed to reset learning path')
      if (pendingId === userId) setPendingId(null)
    },
  })

  function isRowPending(userId: string): boolean {
    return pendingId === userId
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

  const confirmConfig: Record<PendingAction, { title: string; message: string; confirmLabel: string }> = {
    'reset-progress': {
      title: 'Reset progress',
      message:
        "This clears all of this learner's course/block progress. Their learning path stays. This cannot be undone.",
      confirmLabel: 'Reset progress',
    },
    'regenerate-path': {
      title: 'Regenerate learning path',
      message:
        "This rebuilds the learner's path from their existing answers and archives the current path.",
      confirmLabel: 'Regenerate',
    },
    'reset-path': {
      title: 'Reset learning path',
      message:
        "This deletes the learner's path AND their initial form answers, returning them to onboarding. This cannot be undone.",
      confirmLabel: 'Reset path',
    },
  }

  const activeConfig = pendingConfirm ? confirmConfig[pendingConfirm.action] : null

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Learners"
        subtitle="Manage learners' AI learning paths and progress."
      />

      {/* Search */}
      <div className="mb-5 relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-text-muted pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="admin-input pl-8 w-full"
        />
      </div>

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm overflow-hidden"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-brand-primary/40 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm">Failed to load learners</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <GraduationCap className="w-8 h-8 opacity-30" />
            <p className="text-sm">
              {search ? 'No learners match your search.' : 'No learners yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-surface-2 bg-brand-surface/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Learner
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Country
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Path status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Last active
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-surface-2">
                {filtered.map((learner) => {
                  const avatar = learner.avatarUrl ?? dicebearAvatar(learner.fullName)
                  const rowPending = isRowPending(learner.id)

                  return (
                    <tr key={learner.id} className="hover:bg-brand-surface/30 transition-colors">
                      {/* Learner */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={avatar}
                            alt={learner.fullName}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-brand-text-primary truncate">
                              {learner.fullName}
                            </p>
                            <p className="text-xs text-brand-text-muted truncate">{learner.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Country */}
                      <td className="px-5 py-3.5 text-brand-text-secondary">
                        {learner.country ?? <span className="text-brand-text-secondary/40">—</span>}
                      </td>

                      {/* Path status */}
                      <td className="px-5 py-3.5">
                        <PathStatusBadge learner={learner} />
                      </td>

                      {/* Progress */}
                      <td className="px-5 py-3.5 text-brand-text-secondary text-xs">
                        {learner.blocksCompleted > 0 || learner.blocksInProgress > 0 ? (
                          <>
                            <span className="font-medium text-brand-text-primary">
                              {learner.blocksCompleted} done
                            </span>
                            {learner.blocksInProgress > 0 && (
                              <span className="text-brand-text-muted">
                                {' '}· {learner.blocksInProgress} in progress
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-brand-text-secondary/40">—</span>
                        )}
                      </td>

                      {/* Last active */}
                      <td className="px-5 py-3.5 text-brand-text-secondary text-xs">
                        {formatRelativeDate(learner.lastActiveAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          {/* Reset progress */}
                          <button
                            onClick={() =>
                              setPendingConfirm({ userId: learner.id, action: 'reset-progress' })
                            }
                            disabled={rowPending}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Reset progress"
                            aria-label="Reset progress"
                          >
                            {rowPending && resetProgressMutation.variables === learner.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Regenerate learning path */}
                          <button
                            onClick={() =>
                              setPendingConfirm({ userId: learner.id, action: 'regenerate-path' })
                            }
                            disabled={rowPending || !learner.hasQuestionnaire}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={
                              learner.hasQuestionnaire
                                ? 'Regenerate learning path'
                                : 'No intake form responses to regenerate from'
                            }
                            aria-label="Regenerate learning path"
                          >
                            {rowPending && regeneratePathMutation.variables === learner.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Reset learning path (destructive) */}
                          <button
                            onClick={() =>
                              setPendingConfirm({ userId: learner.id, action: 'reset-path' })
                            }
                            disabled={rowPending}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Reset learning path"
                            aria-label="Reset learning path"
                          >
                            {rowPending && resetPathMutation.variables === learner.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eraser className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!pendingConfirm}
        title={activeConfig?.title ?? ''}
        message={activeConfig?.message ?? ''}
        confirmLabel={activeConfig?.confirmLabel}
        onConfirm={handleConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </AdminLayout>
  )
}
