import type { Metadata } from 'next'
import MultiLearningPage from '@/views/dashboard/MultiLearning'

export const metadata: Metadata = { title: 'Interactive Learning' }

export default function Page() {
  return <MultiLearningPage />
}
