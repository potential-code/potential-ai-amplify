'use client'

/**
 * Whole-page states for the learning journeys: loading, building a path, and a
 * message with one action (errors, "not ready yet"). Each keeps the journey's
 * header bar so the page never jumps when the real canvas arrives.
 */

import type { ReactNode } from 'react'
import { Card, Skeleton } from '@/components/kit'
import { JourneyCanvas, JourneyHeader, SanaLine } from './JourneyKit'

export function JourneyLoading({ title, subtitle, leading }: { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode }) {
  return (
    <JourneyCanvas>
      <JourneyHeader leading={leading} title={title} subtitle={subtitle ?? 'Loading your journey'} />
      <div className="flex min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[840px] flex-col gap-4 px-4 py-6 sm:px-8" aria-busy="true" aria-label="Loading">
          <div className="flex items-start gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-16 flex-1 max-w-[520px] rounded-[16px]" />
          </div>
          <Skeleton className="h-48 rounded-[14px] md:ml-[42px]" />
          <Skeleton className="h-10 w-64 self-end rounded-[16px]" />
        </div>
        <div className="hidden w-[312px] shrink-0 flex-col gap-3 border-s border-ui-line bg-ui-surface px-6 py-5 xl:flex">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-2 w-full" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </JourneyCanvas>
  )
}

export function JourneyBuilding({
  title,
  subtitle,
  leading,
  sanaLine,
  sanaAvatar,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  sanaLine?: ReactNode
  sanaAvatar?: ReactNode
  children: ReactNode
}) {
  return (
    <JourneyCanvas>
      <JourneyHeader leading={leading} title={title} subtitle={subtitle} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[840px] flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
          {sanaLine && <SanaLine avatar={sanaAvatar}>{sanaLine}</SanaLine>}
          <Card className="shadow-ui md:ml-[42px] md:max-w-[520px]">{children}</Card>
        </div>
      </div>
    </JourneyCanvas>
  )
}

export function JourneyMessage({
  title,
  subtitle,
  leading,
  heading,
  body,
  action,
  note,
}: {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  heading: ReactNode
  body?: ReactNode
  action?: ReactNode
  note?: ReactNode
}) {
  return (
    <JourneyCanvas>
      <JourneyHeader leading={leading} title={title} subtitle={subtitle} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-8">
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center" role="alert">
            <p className="text-base font-semibold text-ui-text">{heading}</p>
            {body && <p className="max-w-[46ch] text-sm leading-relaxed text-ui-muted">{body}</p>}
            {note && <p className="text-[13px] text-ui-muted">{note}</p>}
            {action && <div className="mt-3">{action}</div>}
          </Card>
        </div>
      </div>
    </JourneyCanvas>
  )
}
