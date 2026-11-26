import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { QueryProvider } from '@/components/QueryProvider'
import type { Metadata } from 'next'
import { NOINDEX } from '@/lib/seo'

// Signed in only: never in search results.
export const metadata: Metadata = { robots: NOINDEX }

export default function MentorGroupLayout({ children }: { children: ReactNode }) {
  // The shell's notification bell uses React Query, like the learner and admin areas.
  return (
    <RequireAuth role="mentor">
      <QueryProvider>{children}</QueryProvider>
    </RequireAuth>
  )
}
