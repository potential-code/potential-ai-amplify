import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import SmeSessions from '@/views/dashboard/Sessions'
import { HUMAN_MENTORS_ENABLED } from '@/lib/features'

export const metadata: Metadata = { title: 'My sessions' }

export default function Page() {
  // Mentor sessions only exist with human mentors; old links go to the AI mentors.
  if (!HUMAN_MENTORS_ENABLED) redirect('/dashboard/ai-mentors')
  return <SmeSessions />
}
