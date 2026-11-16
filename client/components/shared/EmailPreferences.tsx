'use client'

/**
 * "Emails" on the profile (GET/PUT /api/account/email-preferences): AI Amplify
 * announcement emails on or off, and for learners, marketing from AI Amplify
 * by Potential.org (the consent given or not at sign-up).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MARKETING_CONSENT_TEXT } from '@/lib/signUpConsent'

type Prefs = { announcements: boolean; marketing?: boolean }
type Change = { announcements: boolean } | { marketing: boolean }

export function EmailPreferences({ className }: { className?: string }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['account', 'email-preferences'],
    queryFn: () => apiFetch<{ data: Prefs }>('/api/account/email-preferences').then((r) => r.data),
  })
  const save = useMutation({
    mutationFn: (change: Change) =>
      apiFetch('/api/account/email-preferences', { method: 'PUT', body: JSON.stringify(change) }),
    onMutate: (change) => qc.setQueryData<Prefs>(['account', 'email-preferences'], (p) => (p ? { ...p, ...change } : p)),
    onSuccess: (_d, change) =>
      toast.success(
        'marketing' in change
          ? change.marketing ? 'You’ll get updates from AI Amplify by Potential.org' : 'Updates from AI Amplify by Potential.org turned off'
          : change.announcements ? 'You’ll get announcement emails' : 'Announcement emails turned off',
      ),
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
          onCheckedChange={(v) => save.mutate({ announcements: v })}
          className="data-[state=checked]:bg-ui-brand data-[state=unchecked]:bg-ui-line"
        />
      </div>
      {data?.marketing !== undefined && (
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="p-marketing-emails" className="min-w-0">
            <span className="block text-sm font-medium text-ui-text">Updates from AI Amplify by Potential.org</span>
            <span className="block text-[13px] text-ui-muted">{MARKETING_CONSENT_TEXT}</span>
          </label>
          <Switch
            id="p-marketing-emails"
            checked={data.marketing}
            disabled={save.isPending}
            onCheckedChange={(v) => save.mutate({ marketing: v })}
            className="data-[state=checked]:bg-ui-brand data-[state=unchecked]:bg-ui-line"
          />
        </div>
      )}
    </section>
  )
}
