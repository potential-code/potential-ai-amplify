import type { Metadata } from 'next'
import PartnerSetupPage from '@/views/partner/Setup'
import { NOINDEX } from '@/lib/seo'

export const metadata: Metadata = { title: 'Set up your partner login', robots: NOINDEX }

export default function Page() {
  return <PartnerSetupPage />
}
