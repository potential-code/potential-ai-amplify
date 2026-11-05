import type { Metadata } from 'next'
import SmeSessions from '@/views/dashboard/Sessions'

export const metadata: Metadata = { title: 'My sessions' }

export default function SessionsPage() {
  return <SmeSessions />
}
