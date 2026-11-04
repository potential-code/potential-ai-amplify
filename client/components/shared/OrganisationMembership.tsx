'use client'

/**
 * "Organisation" on the learner's profile: the partner organisation they
 * belong to (it can see their course progress), with a way to leave it.
 * Shows nothing for learners who aren't in one.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { btn } from '@/components/kit'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { resetOrganisationMembership } from '@/lib/aiTurns'

export function OrganisationMembership({ className }: { className?: string }) {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const { data } = useQuery({
    queryKey: ['me', 'organisation'],
    queryFn: () => apiFetch<{ data: { id: string; name: string } | null }>('/api/me/organisation').then((r) => r.data),
  })
  const leave = useMutation({
    mutationFn: () => apiFetch('/api/me/organisation/leave', { method: 'POST' }),
    onSuccess: () => {
      toast.success(`You left ${data?.name ?? 'the organisation'}`)
      qc.setQueryData(['me', 'organisation'], null)
      resetOrganisationMembership()
    },
    onError: () => toast.error('That didn’t work. Try again.'),
    onSettled: () => setConfirming(false),
  })
  if (!data) return null
  return (
    <section aria-labelledby="p-org" className={cn('flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]', className)}>
      <h2 id="p-org" className="flex items-center gap-2 text-base font-semibold text-ui-text">
        <Building2 className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
        Organisation
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-ui-text">
          <span className="font-medium">{data.name}</span>
          <span className="block text-[13px] text-ui-muted">
            They can see your learning record (courses, exams, certificates, events, mentor sessions) and your chats with Anna and the AI mentors.
          </span>
        </p>
        <button type="button" className={btn({ variant: 'secondary', size: 'sm' })} onClick={() => setConfirming(true)}>
          Leave
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Leave ${data.name}?`}
        message={`${data.name} will stop seeing your record, and your saved chats are deleted. Your account, courses and certificates stay as they are.`}
        confirmLabel="Leave"
        onConfirm={() => leave.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  )
}
