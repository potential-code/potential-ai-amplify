import type { Metadata } from 'next'
import AiSafetyPage from '@/views/admin/AiSafety'

export const metadata: Metadata = { title: 'AI safety' }

export default function Page() {
  return <AiSafetyPage />
}
