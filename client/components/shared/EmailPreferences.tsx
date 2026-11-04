'use client'

/** "Emails" on the profile: announcement emails on or off (GET/PUT /api/account/email-preferences). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

export function EmailPreferences({ className }: { className?: string }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['account', 'email-preferences'],
    queryFn: () => apiFetch<{ data: { announcements: boolean } }>('/api/account/email-preferences').then((r) => r.data),
  })
  const save = useMutation({
    mutationFn: (on: boolean) =>
      apiFetch('/api/account/email-preferences', { method: 'PUT', body: JSON.stringify({ announcements: on }) }),
    onMutate: (on) => qc.setQueryData(['account', 'email-preferences'], { announcements: on }),
    onSuccess: (_d, on) => toast.success(on ? 'You’ll get announcement emails' : 'Announcement emails turned off'),
    onError: () => {
      toast.error('That didn’t save. Try again.')
      void qc.invalidateQueries({ queryKey: ['account', 'email-preferences'] })
    },
  })
  const on = data?.announcements ?? true
  return (
    <section aria-labelledby="p-emails" className={cn('flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]', className)}>
      <h2 id="p-emails" className="flex items-center gap-2 text-base font-semibold text-ui-text">
        <Mail className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
        Emails
      </h2>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="p-announcement-emails" className="min-w-0">
          <span className="block text-sm font-medium text-ui-text">Announcements from AI Amplify</span>
          <span className="block text-[13px] text-ui-muted">New courses, events and programme news. Booking and sign-in emails always arrive.</span>
        </label>
        <Switch
          id="p-announcement-emails"
          checked={on}
          disabled={!data || save.isPending}
          onCheckedChange={(v) => save.mutate(v)}
          className="data-[state=checked]:bg-ui-brand data-[state=unchecked]:bg-ui-line"
        />
      </div>
    </section>
  )
}
