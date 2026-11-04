import type { Metadata } from 'next'
import PartnerDashboardPage from '@/views/partner/Dashboard'

export const metadata: Metadata = { title: 'Partner dashboard' }

export default function Page() {
  return <PartnerDashboardPage />
}
