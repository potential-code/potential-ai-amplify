import type { Metadata } from 'next'
import MultiLearningAppPage from '@/views/dashboard/MultiLearningApp'

export const metadata: Metadata = { title: 'Interactive Learning app' }

export default function Page() {
  return <MultiLearningAppPage />
}
