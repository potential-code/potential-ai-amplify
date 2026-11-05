import type { Metadata } from 'next'
import LearnersView from '@/views/admin/Learners'

export const metadata: Metadata = { title: 'Learners' }

export default async function Page() {
  return <LearnersView />
}
