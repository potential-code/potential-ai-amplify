import StakeholderApplicationsView from '@/views/admin/StakeholderApplications'

interface Props {
  params: Promise<{ type: string }>
}

export default async function Page({ params }: Props) {
  const { type } = await params
  // Keyed by type so search, page and the open detail reset when switching tabs.
  return <StakeholderApplicationsView key={type} type={type} />
}
