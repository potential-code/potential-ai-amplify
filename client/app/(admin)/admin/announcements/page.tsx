import type { Metadata } from 'next'
import AnnouncementsPage from '@/views/admin/Announcements'

export const metadata: Metadata = { title: 'Announcements' }

export default function Page() {
  return <AnnouncementsPage />
}
