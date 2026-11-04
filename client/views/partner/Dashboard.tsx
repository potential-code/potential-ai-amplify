'use client'

/**
 * A partner contact's dashboard: their organisation's learners, read only,
 * with downloads and the sign-up link to share.
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { PartnerLayout } from '@/components/partner/PartnerLayout'
import { btn, EmptyState, PageHeader, Skeleton } from '@/components/kit'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { JoinLinkCard, OrganisationDashboard, type OrganisationDashboardData } from '@/components/organisations/OrganisationDashboard'
import { apiFetch } from '@/lib/api'
import { signOut } from '@/lib/auth'

export default function PartnerDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['partner', 'dashboard'],
    queryFn: () => apiFetch<{ data: OrganisationDashboardData }>('/api/partner/dashboard').then((r) => r.data),
    retry: false,
  })
  // Signed out (e.g. an admin removed this login): go to sign in.
  useEffect(() => {
    if ((error as { status?: number } | null)?.status === 401) {
      void signOut().finally(() => window.location.assign('/login'))
    }
  }, [error])

  return (
    <PartnerLayout>
      <PageHeader
        title={data?.organisation.name ?? 'Your learners'}
        subtitle="Your organisation's learners on AI Amplify: who has joined, their progress, certificates and learning gain."
        actions={data ? <ExportMenu endpoint="/api/partner/exports" datasets={['learners', 'course-progress', 'learning-gain', 'certificates']} /> : undefined}
      />
      {isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[112px]" />
            ))}
          </div>
          <Skeleton className="h-[260px]" />
        </div>
      ) : error || !data ? (
        <EmptyState
          icon={Building2}
          title="Your dashboard isn't available"
          body={(error as { error?: { message?: string } } | null)?.error?.message ?? 'Try again in a moment, or contact the AI Amplify team.'}
          action={
            <button
              type="button"
              className={btn({ variant: 'secondary' })}
              onClick={async () => {
                await signOut()
                window.location.assign('/login')
              }}
            >
              Sign out
            </button>
          }
        />
      ) : (
        <OrganisationDashboard
          data={data}
          learnerHref={(l) => `/partner/learners/${l.id}`}
          emptyLearners={
            <div className="p-5">
              <JoinLinkCard link={data.organisation.joinLink} enabled={data.organisation.joinEnabled} className="border-dashed" />
            </div>
          }
        />
      )}
      {data && data.learners.length > 0 && <JoinLinkCard link={data.organisation.joinLink} enabled={data.organisation.joinEnabled} className="mt-5" />}
    </PartnerLayout>
  )
}
