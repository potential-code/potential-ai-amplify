'use client'

/**
 * Partner organisations: each has a sign-up link its learners join with, and
 * partner contacts who see a read-only dashboard of those learners.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button, EmptyState, Field, inputClass, PageHeader, Skeleton } from '@/components/kit'
import { Modal, Pill, Select, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { apiFetch } from '@/lib/api'

export type OrganisationType = 'government' | 'university' | 'corporate' | 'incubator' | 'investor' | 'other'
export const ORG_TYPES: { value: OrganisationType; label: string }[] = [
  { value: 'government', label: 'Government' },
  { value: 'university', label: 'University' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'incubator', label: 'Incubator or accelerator' },
  { value: 'investor', label: 'Investor' },
  { value: 'other', label: 'Other' },
]
export const orgTypeLabel = (t: string) => ORG_TYPES.find((o) => o.value === t)?.label ?? 'Other'

type Row = {
  id: string
  name: string
  type: string
  joinCode: string
  joinLink: string
  joinEnabled: boolean
  createdAt: string
  learners: number
  activeLearners: number
  partners: number
}

/** The error message the API sent, for a toast. */
export function apiMessage(e: unknown, fallback: string): string {
  return (e as { error?: { message?: string } } | null)?.error?.message ?? fallback
}

function NewOrganisationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState<OrganisationType>('government')
  const create = useMutation({
    mutationFn: () => apiFetch<{ data: { id: string } }>('/api/admin/organisations', { method: 'POST', body: JSON.stringify({ name: name.trim(), type }) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'organisations'] })
      toast.success('Organisation created')
      onClose()
      setName('')
      router.push(`/admin/organisations/${r.data.id}`)
    },
    onError: (e) => toast.error(apiMessage(e, 'That didn’t save. Try again.')),
  })
  const ok = name.trim().length >= 2
  return (
    <Modal
      open={open}
      title="New organisation"
      description="A partner whose learners you want to follow together. You’ll get a sign-up link to share."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!ok || create.isPending}>
            Create organisation
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) create.mutate()
        }}
      >
        <Field label="Name" htmlFor="org-name">
          <input id="org-name" className={inputClass} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ministry of Economy" />
        </Field>
        <Field label="Type" htmlFor="org-type">
          <Select id="org-type" value={type} onChange={(e) => setType(e.target.value as OrganisationType)}>
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

export default function AdminOrganisationsPage() {
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: () => apiFetch<{ data: Row[] }>('/api/admin/organisations').then((r) => r.data),
  })

  return (
    <AdminLayout>
      <PageHeader
        title="Organisations"
        subtitle="Partners whose learners you follow together. Learners join with the organisation’s sign-up link; partner contacts get a read-only dashboard."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New organisation
          </Button>
        }
      />
      <TableCard>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={Building2}
            title="No organisations yet"
            body="Create one for each partner, such as a ministry, university or corporate, then share its sign-up link."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                New organisation
              </Button>
            }
          />
        ) : (
          <table className={adminTableClass}>
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Type</th>
                <th className="text-right">Learners</th>
                <th className="text-right">Active, 30 days</th>
                <th className="text-right">Partner logins</th>
                <th>Sign-up link</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/organisations/${o.id}`} className="font-semibold text-ui-text hover:text-ui-brand-text hover:underline">
                      {o.name}
                    </Link>
                  </td>
                  <td className="text-ui-muted">{orgTypeLabel(o.type)}</td>
                  <td className="text-right tabular-nums">{o.learners}</td>
                  <td className="text-right tabular-nums">{o.activeLearners}</td>
                  <td className="text-right tabular-nums">{o.partners}</td>
                  <td>{o.joinEnabled ? <Pill tone="ok">On · {o.joinCode}</Pill> : <Pill tone="neutral">Off</Pill>}</td>
                  <td className="whitespace-nowrap text-ui-muted">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <NewOrganisationDialog open={creating} onClose={() => setCreating(false)} />
    </AdminLayout>
  )
}
