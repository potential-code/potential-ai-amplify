import type { Metadata } from 'next'
import AdminOrganisationDetailPage from '@/views/admin/OrganisationDetail'

export const metadata: Metadata = { title: 'Organisation' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminOrganisationDetailPage id={id} />
}
