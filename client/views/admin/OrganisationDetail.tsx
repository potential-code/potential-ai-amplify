'use client'

/**
 * One organisation, as an admin sees it: the same dashboard its partner
 * contacts see, plus the sign-up link, partner logins, adding learners by
 * email, and archiving.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Check, RefreshCw, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button, Card, EmptyState, Field, inputClass, PageHeader, Skeleton, btn } from '@/components/kit'
import { IconButton, Pill, Switch, fmtDate } from '@/components/admin/ui'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { JoinLinkCard, OrganisationDashboard, type OrganisationDashboardData, type OrganisationLearner } from '@/components/organisations/OrganisationDashboard'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { apiMessage, orgTypeLabel } from './Organisations'

type Partner = {
  id: string
  fullName: string
  email: string
  status: 'active' | 'invited'
  at: string | null
  setupLink?: string
  expiresAt?: string
}
type AddResult = { added: string[]; moved: string[]; already: string[]; notFound: string[]; notLearners: string[] }

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <IconButton
      label={done ? 'Copied' : label}
      icon={done ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          window.setTimeout(() => setDone(false), 1600)
        } catch {
          toast.error('Copy didn’t work. Select the link and copy it.')
        }
      }}
    />
  )
}

function PartnersCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const key = ['admin', 'organisations', orgId, 'partners']
  const { data: partners } = useQuery({ queryKey: key, queryFn: () => apiFetch<{ data: Partner[] }>(`/api/admin/organisations/${orgId}/partners`).then((r) => r.data) })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<Partner | null>(null)
  const invite = useMutation({
    mutationFn: () => apiFetch(`/api/admin/organisations/${orgId}/partners`, { method: 'POST', body: JSON.stringify({ fullName: name.trim(), email: email.trim() }) }),
    onSuccess: () => {
      toast.success('Invite sent', { description: `${email.trim()} gets a setup link by email. You can also copy it below.` })
      setName('')
      setEmail('')
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error(apiMessage(e, 'The invite didn’t send. Try again.')),
  })
  const remove = useMutation({
    mutationFn: (p: Partner) =>
      apiFetch(p.status === 'active' ? `/api/admin/organisations/${orgId}/partners/${p.id}` : `/api/admin/organisations/${orgId}/invites/${p.id}`, { method: 'DELETE' }),
    onSuccess: (_d, p) => {
      toast.success(p.status === 'active' ? 'Partner login removed' : 'Invite cancelled')
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t work. Try again.')),
    onSettled: () => setRemoving(null),
  })
  const ok = name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email.trim())

  return (
    <Card className="flex flex-col p-5">
      <h2 className="text-base font-semibold text-ui-text">Partner logins</h2>
      <p className="mt-0.5 text-[13px] text-ui-muted">People at the organisation who can see this dashboard (read only).</p>
      <ul className="mt-3 flex flex-col divide-y divide-ui-line">
        {partners?.length === 0 && <li className="py-2 text-[13px] text-ui-muted">No partner logins yet.</li>}
        {partners?.map((p) => (
          <li key={`${p.status}-${p.id}`} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ui-text">
                {p.fullName} {p.status === 'invited' && <Pill tone="neutral" className="ms-1">Invited</Pill>}
              </p>
              <p className="truncate text-xs text-ui-muted">
                {p.email} ·{' '}
                {p.status === 'active' ? (p.at ? `last seen ${fmtDate(p.at)}` : 'not signed in yet') : `link works until ${fmtDate(p.expiresAt ?? null)}`}
              </p>
            </div>
            {p.setupLink && <CopyButton text={p.setupLink} label={`Copy ${p.fullName}'s setup link`} />}
            <IconButton label={p.status === 'active' ? `Remove ${p.fullName}'s login` : `Cancel ${p.fullName}'s invite`} icon={UserMinus} tone="danger" onClick={() => setRemoving(p)} />
          </li>
        ))}
      </ul>
      <form
        className="mt-3 grid gap-2 border-t border-ui-line pt-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) invite.mutate()
        }}
      >
        <input className={inputClass} aria-label="Partner's full name" placeholder="Full name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} aria-label="Partner's email" type="email" placeholder="Email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={!ok || invite.isPending}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Invite
        </Button>
      </form>
      <ConfirmDialog
        open={!!removing}
        title={removing?.status === 'active' ? 'Remove partner login' : 'Cancel invite'}
        message={
          removing?.status === 'active'
            ? `${removing.fullName} won’t be able to sign in or see this dashboard any more. Learners aren’t affected.`
            : `The setup link sent to ${removing?.email ?? ''} will stop working.`
        }
        confirmLabel={removing?.status === 'active' ? 'Remove login' : 'Cancel invite'}
        onConfirm={() => removing && remove.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  )
}

function AddLearnersCard({ orgId, onAdded, enabled }: { orgId: string; onAdded: () => void; enabled: boolean }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<AddResult | null>(null)
  const emails = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^\S+@\S+\.\S+$/.test(s)))]
  const add = useMutation({
    mutationFn: () => apiFetch<{ data: AddResult }>(`/api/admin/organisations/${orgId}/learners`, { method: 'POST', body: JSON.stringify({ emails }) }).then((r) => r.data),
    onSuccess: (r) => {
      setResult(r)
      const n = r.added.length + r.moved.length
      if (n) {
        toast.success(`${n} learner${n === 1 ? '' : 's'} added`)
        setText('')
        onAdded()
      }
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t work. Try again.')),
  })
  const lines = result
    ? [
        result.added.length && `${result.added.length} added`,
        result.moved.length && `${result.moved.length} moved from another organisation`,
        result.already.length && `${result.already.length} already here`,
        result.notFound.length && `No AI Amplify account: ${result.notFound.join(', ')}`,
        result.notLearners.length && `Not learner accounts: ${result.notLearners.join(', ')}`,
      ].filter(Boolean)
    : []
  return (
    <Card className="flex flex-col p-5">
      <h2 className="text-base font-semibold text-ui-text">Add existing learners</h2>
      <p className="mt-0.5 text-[13px] text-ui-muted">Paste their emails. Each is told in their notifications what the organisation can see, and can leave from their profile.</p>
      {!enabled && (
        <p role="status" className="mt-3 rounded-[10px] bg-ui-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ui-muted">
          Not available yet: learner messages are off until the client approves them, so learners couldn&apos;t be told the organisation can
          see their record. Share the sign-up link above instead; it tells people before they join.
        </p>
      )}
      <Field label="Emails" htmlFor="org-add" className="mt-3">
        <textarea id="org-add" className={cn(inputClass, 'h-auto min-h-[84px] py-2')} value={text} onChange={(e) => setText(e.target.value)} placeholder="one@company.com, two@company.com" />
      </Field>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ui-muted">{emails.length ? `${emails.length} email${emails.length === 1 ? '' : 's'}` : ''}</span>
        <Button variant="secondary" onClick={() => add.mutate()} disabled={!enabled || !emails.length || emails.length > 500 || add.isPending}>
          Add learners
        </Button>
      </div>
      {lines.length > 0 && (
        <ul role="status" className="mt-3 flex flex-col gap-0.5 rounded-[10px] bg-ui-surface-2 px-3 py-2 text-[13px] text-ui-text">
          {lines.map((l) => (
            <li key={String(l)}>{l}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function AdminOrganisationDetailPage({ id }: { id: string }) {
  const qc = useQueryClient()
  const router = useRouter()
  const dashKey = ['admin', 'organisations', id, 'dashboard']
  const { data, isLoading, error } = useQuery({
    queryKey: dashKey,
    queryFn: () => apiFetch<{ data: OrganisationDashboardData }>(`/api/admin/organisations/${id}/dashboard`).then((r) => r.data),
  })
  const [confirm, setConfirm] = useState<'regenerate' | 'archive' | null>(null)
  const [removing, setRemoving] = useState<OrganisationLearner | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: dashKey })
    void qc.invalidateQueries({ queryKey: ['admin', 'organisations'], exact: true })
  }

  const patch = useMutation({
    mutationFn: (body: { joinEnabled: boolean }) => apiFetch(`/api/admin/organisations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_d, b) => {
      toast.success(b.joinEnabled ? 'Sign-up link turned on' : 'Sign-up link turned off')
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t save. Try again.')),
  })
  const regenerate = useMutation({
    mutationFn: () => apiFetch(`/api/admin/organisations/${id}/join-code`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('New sign-up link ready', { description: 'The old link no longer works.' })
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t work. Try again.')),
    onSettled: () => setConfirm(null),
  })
  const archive = useMutation({
    mutationFn: () => apiFetch(`/api/admin/organisations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Organisation archived')
      // Only the list: this organisation's own queries would 404 now.
      void qc.invalidateQueries({ queryKey: ['admin', 'organisations'], exact: true })
      router.push('/admin/organisations')
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t work. Try again.')),
    onSettled: () => setConfirm(null),
  })
  const removeLearner = useMutation({
    mutationFn: (l: OrganisationLearner) => apiFetch(`/api/admin/organisations/${id}/learners/${l.id}`, { method: 'DELETE' }),
    onSuccess: (_d, l) => {
      toast.success(`${l.fullName} removed from the organisation`)
      refresh()
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t work. Try again.')),
    onSettled: () => setRemoving(null),
  })

  const org = data?.organisation
  return (
    <AdminLayout>
      <Link href="/admin/organisations" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ui-muted hover:text-ui-text">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Organisations
      </Link>
      <PageHeader
        title={org?.name ?? 'Organisation'}
        subtitle={org ? `${orgTypeLabel(org.type)}. The three cards at the top are for AI Amplify admins; partner logins see everything below them.` : undefined}
        actions={org ? <ExportMenu endpoint={`/api/admin/organisations/${id}/exports`} datasets={['learners', 'course-progress', 'learning-gain', 'certificates']} /> : undefined}
      />
      {isLoading ? (
        <Skeleton className="h-[320px]" />
      ) : error || !data || !org ? (
        <EmptyState title="This organisation couldn’t be loaded" body={apiMessage(error, 'It may have been archived.')} action={<Link href="/admin/organisations" className={btn({ variant: 'secondary' })}>All organisations</Link>} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-3">
            <JoinLinkCard link={org.joinLink} enabled={org.joinEnabled}>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ui-line pt-3">
                <div className="flex items-center gap-2.5 text-sm text-ui-text">
                  <Switch checked={org.joinEnabled} onChange={(v) => patch.mutate({ joinEnabled: v })} disabled={patch.isPending} label="Sign-up link on" />
                  <span aria-hidden>{org.joinEnabled ? 'Link on' : 'Link off'}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setConfirm('regenerate')}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  New link
                </Button>
              </div>
            </JoinLinkCard>
            <PartnersCard orgId={id} />
            <AddLearnersCard orgId={id} onAdded={refresh} enabled={data.canAddLearners !== false} />
          </div>

          <OrganisationDashboard
            data={data}
            learnerHref={(l) => `/admin/organisations/${id}/learners/${l.id}`}
            learnerAction={(l) => <IconButton label={`Remove ${l.fullName} from ${org.name}`} icon={UserMinus} tone="danger" onClick={() => setRemoving(l)} />}
          />

          <Card className="flex flex-wrap items-center justify-between gap-3 border-[color-mix(in_srgb,var(--ui-danger)_30%,var(--ui-line))] p-5">
            <div>
              <h2 className="text-base font-semibold text-ui-text">Archive organisation</h2>
              <p className="mt-0.5 text-[13px] text-ui-muted">The sign-up link stops, partner logins are removed, and learners leave it. Their accounts and progress stay.</p>
            </div>
            <Button variant="secondary" onClick={() => setConfirm('archive')} className="text-ui-danger">
              <Trash2 className="h-4 w-4" aria-hidden />
              Archive
            </Button>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={confirm === 'regenerate'}
        title="Make a new sign-up link?"
        message="The current link stops working straight away. Anyone you shared it with will need the new one."
        confirmLabel="Make new link"
        tone="primary"
        onConfirm={() => regenerate.mutate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        title={`Archive ${org?.name ?? 'organisation'}?`}
        message="Partner logins are removed and learners leave the organisation. Learner accounts and progress are kept. This can’t be undone."
        confirmLabel="Archive"
        onConfirm={() => archive.mutate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove from organisation"
        message={`${removing?.fullName ?? 'This learner'} leaves ${org?.name ?? 'the organisation'}. Their account and progress stay.`}
        confirmLabel="Remove"
        onConfirm={() => removing && removeLearner.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
    </AdminLayout>
  )
}
