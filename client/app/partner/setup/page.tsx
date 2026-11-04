import type { Metadata } from 'next'
import PartnerSetupPage from '@/views/partner/Setup'

export const metadata: Metadata = { title: 'Set up your partner login' }

export default function Page() {
  return <PartnerSetupPage />
}
