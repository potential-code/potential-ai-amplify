'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LiveEvent } from '@/lib/api/liveEvents'
import { isYouTubeUrl } from '@/lib/video'

/**
 * "Watch recording": YouTube recordings play on AI Amplify's own recording page
 * (/dashboard/events/:id/recording, in the AI Amplify player); any other link
 * opens in a new tab.
 */
export function RecordingLink({
  event,
  className,
  children,
}: {
  event: Pick<LiveEvent, 'id' | 'recordingLink'>
  className: string
  children: ReactNode
}) {
  const link = event.recordingLink
  if (!link) return null
  if (isYouTubeUrl(link)) {
    return (
      <Link href={`/dashboard/events/${event.id}/recording`} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={link} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}
