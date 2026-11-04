'use client'

/**
 * Announcements: tell learners and/or mentors something, as a dashboard
 * banner, a bell notification and/or an email (to people who haven't turned
 * announcement emails off). Shows who it will reach, a live preview, and
 * every announcement sent.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, GraduationCap, Mail, Megaphone, PanelTop, Send, Users, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Pill, Segmented, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { Button, Card, EmptyState, Field, PageHeader, Skeleton, inputClass } from '@/components/kit'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AnnouncementCard } from '@/components/dashboard/AnnouncementBanner'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type Audience = 'learners' | 'mentors' | 'all'
type Row = {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  audience: Audience
  showBanner: boolean
  bannerUntil: string | null
  notified: boolean
  emailed: boolean
  emailRecipients: number
  createdAt: string
  archivedAt: string | null
  createdByName: string | null
}

const AUDIENCES: { value: Audience; label: string; icon: typeof Users }[] = [
  { value: 'learners', label: 'Learners', icon: GraduationCap },
  { value: 'mentors', label: 'Mentors', icon: UsersRound },
  { value: 'all', label: 'Everyone', icon: Users },
]
const AUDIENCE_LABEL: Record<Audience, string> = { learners: 'Learners', mentors: 'Mentors', all: 'Everyone' }

function bannerState(r: Row): { label: string; tone: 'ok' | 'neutral' } | null {
  if (!r.showBanner) return null
  if (r.archivedAt) return { label: 'Taken down', tone: 'neutral' }
  if (r.bannerUntil && new Date(r.bannerUntil) < new Date()) return { label: 'Ended', tone: 'neutral' }
  return { label: r.bannerUntil ? `Live until ${fmtDate(r.bannerUntil)}` : 'Live', tone: 'ok' }
}

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [audience, setAudience] = useState<Audience>('learners')
  const [showBanner, setShowBanner] = useState(true)
  const [bannerDays, setBannerDays] = useState(7)
  const [notify, setNotify] = useState(true)
  const [email, setEmail] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const history = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => apiFetch<{ data: Row[] }>('/api/admin/announcements').then((r) => r.data),
  })
  const reach = useQuery({
    queryKey: ['admin', 'announcements', 'audience', audience],
    queryFn: () =>
      apiFetch<{ data: { people: number; emailable: number; learnersPaused: boolean } }>(`/api/admin/announcements/audience?audience=${audience}`).then((r) => r.data),
  })

  const send = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim() || null,
          linkLabel: linkLabel.trim() || null,
          audience,
          showBanner,
          bannerDays: showBanner ? bannerDays : null,
          notify,
          email,
        }),
      }),
    onSuccess: () => {
      toast.success('Announcement sent')
      setTitle('')
      setBody('')
      setLinkUrl('')
      setLinkLabel('')
      setEmail(false)
      setError(null)
      void qc.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'It didn’t send. Check the fields and try again.'),
  })

  const archive = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/announcements/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Banner taken down')
      void qc.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    },
  })

  const linkOk = !linkUrl.trim() || /^\/[\w\-/?=&#.%]*$/.test(linkUrl.trim()) || /^https:\/\/\S+$/i.test(linkUrl.trim())
  const ready = title.trim().length >= 3 && body.trim().length >= 3 && linkOk && (showBanner || notify || email)
  const submit = () => {
    if (!ready || send.isPending) return
    if (email) setConfirming(true)
    else send.mutate()
  }

  const preview = { id: 'preview', title: title.trim() || 'Your announcement title', body: body.trim() || 'Your message appears here.', linkUrl: linkUrl.trim() || null, linkLabel: linkLabel.trim() || null }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Announcements"
          subtitle="Tell learners and mentors what’s new, on their dashboard, in the bell, or by email."
          className="mb-0"
        />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="flex flex-col gap-4 p-5">
            <Field label="Title" htmlFor="an-title">
              <input id="an-title" className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Three new courses on pricing" />
            </Field>
            <Field label="Message" htmlFor="an-body" hint={`${body.length}/2000`}>
              <textarea
                id="an-body"
                className={cn(inputClass, 'h-auto min-h-[110px] py-2.5')}
                value={body}
                maxLength={2000}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What should people know, and what should they do next?"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Field
                label={<>Link <span className="font-normal text-ui-muted">(optional)</span></>}
                htmlFor="an-link"
                error={linkOk ? undefined : 'Use a page path like /dashboard/events, or an https:// link'}
                hint="A page path like /dashboard/courses, or an https:// link"
              >
                <input id="an-link" className={inputClass} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/dashboard/courses" />
              </Field>
              <Field label="Button text" htmlFor="an-label">
                <input id="an-label" className={inputClass} value={linkLabel} maxLength={40} disabled={!linkUrl.trim()} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Learn more" />
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ui-text">Who</span>
              <Segmented<Audience> label="Audience" options={AUDIENCES} value={audience} onChange={setAudience} className="self-start" />
              {reach.data?.learnersPaused && (
                <p role="status" className="rounded-[10px] bg-ui-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ui-muted">
                  Learners don&apos;t get announcements yet: learner messages stay off until the client approves them.
                  {audience === 'all' ? ' This one reaches mentors only.' : ' Nobody will receive this one.'}
                </p>
              )}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-ui-text">How</legend>
              <label className="flex items-center gap-3 rounded-[10px] border border-ui-line px-3.5 py-2.5">
                <input type="checkbox" checked={showBanner} onChange={(e) => setShowBanner(e.target.checked)} className="h-4 w-4 accent-[var(--ui-brand)]" />
                <PanelTop className="h-4 w-4 text-ui-muted" aria-hidden />
                <span className="flex-1 text-sm text-ui-text">Banner on their dashboard</span>
                <span className="flex items-center gap-1.5 text-sm text-ui-muted">
                  for
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={bannerDays}
                    disabled={!showBanner}
                    onChange={(e) => setBannerDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    aria-label="Banner days"
                    className={cn(inputClass, 'h-8 w-16 px-2 text-center')}
                  />
                  days
                </span>
              </label>
              <label className="flex items-center gap-3 rounded-[10px] border border-ui-line px-3.5 py-2.5">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[var(--ui-brand)]" />
                <Bell className="h-4 w-4 text-ui-muted" aria-hidden />
                <span className="flex-1 text-sm text-ui-text">Bell notification</span>
                <span className="text-sm text-ui-muted tabular-nums">{reach.data ? `${reach.data.people} people` : ''}</span>
              </label>
              <label className="flex items-center gap-3 rounded-[10px] border border-ui-line px-3.5 py-2.5">
                <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4 accent-[var(--ui-brand)]" />
                <Mail className="h-4 w-4 text-ui-muted" aria-hidden />
                <span className="flex-1 text-sm text-ui-text">Email</span>
                <span className="text-sm text-ui-muted tabular-nums">
                  {reach.data ? `${reach.data.emailable} people` : ''}
                  {reach.data && reach.data.people > reach.data.emailable ? ` (${reach.data.people - reach.data.emailable} opted out)` : ''}
                </span>
              </label>
            </fieldset>

            {error && <p className="text-[13px] text-ui-danger" role="alert">{error}</p>}
            <div className="flex items-center gap-3">
              <Button onClick={submit} disabled={!ready || send.isPending}>
                <Send className="h-4 w-4" aria-hidden />
                {send.isPending ? 'Sending…' : 'Send announcement'}
              </Button>
              {!(showBanner || notify || email) && <span className="text-[13px] text-ui-muted">Choose at least one way to send it.</span>}
            </div>
          </Card>

          <div className="flex flex-col gap-2 xl:sticky xl:top-6">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-muted">Banner preview</span>
            <AnnouncementCard a={preview} onDismiss={() => {}} />
            <p className="text-[13px] text-ui-muted">
              People can dismiss the banner. The bell links to {linkUrl.trim() && !/^https?:/i.test(linkUrl.trim()) ? linkUrl.trim() : 'their dashboard'}.
              Emails include a one-click unsubscribe.
            </p>
          </div>
        </div>

        <TableCard header={<h2 className="px-5 pt-4 text-[15px] font-semibold text-ui-text">Sent</h2>}>
          {history.isLoading ? (
            <div className="p-5"><Skeleton className="h-24" /></div>
          ) : !history.data?.length ? (
            <EmptyState icon={Megaphone} title="No announcements yet" body="What you send appears here, with who it reached." />
          ) : (
            <table className={adminTableClass}>
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Who</th>
                  <th>Sent as</th>
                  <th>Banner</th>
                  <th>Sent</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {history.data.map((r) => {
                  const b = bannerState(r)
                  return (
                    <tr key={r.id}>
                      <td className="max-w-[340px]">
                        <span className="block truncate font-medium text-ui-text">{r.title}</span>
                        <span className="block truncate text-xs text-ui-muted">{r.body}</span>
                      </td>
                      <td>{AUDIENCE_LABEL[r.audience] ?? r.audience}</td>
                      <td className="whitespace-nowrap text-ui-muted">
                        {[r.showBanner && 'Banner', r.notified && 'Bell', r.emailed && `Email (${r.emailRecipients})`].filter(Boolean).join(' · ')}
                      </td>
                      <td>{b ? <Pill tone={b.tone === 'ok' ? 'ok' : 'neutral'}>{b.label}</Pill> : <span className="text-ui-muted">—</span>}</td>
                      <td className="whitespace-nowrap text-ui-muted">
                        {fmtDate(r.createdAt)}
                        {r.createdByName ? ` · ${r.createdByName}` : ''}
                      </td>
                      <td className="text-right">
                        {b?.tone === 'ok' && (
                          <Button size="sm" variant="secondary" onClick={() => archive.mutate(r.id)} disabled={archive.isPending}>
                            Take down
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Email ${reach.data?.emailable ?? 0} people?`}
          message={`“${title.trim()}” goes to every ${audience === 'mentors' || reach.data?.learnersPaused ? 'mentor' : audience === 'all' ? 'learner and mentor' : 'learner'} who gets announcement emails. Emails can’t be unsent.`}
          confirmLabel="Send email"
          onConfirm={() => {
            setConfirming(false)
            send.mutate()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </AdminLayout>
  )
}
