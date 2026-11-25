import type { Metadata } from 'next'
import EventRecordingPage from '@/views/dashboard/EventRecording'

export const metadata: Metadata = { title: "Event recording" }

export default function Page() {
  return <EventRecordingPage />
}
