'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { QueryProvider } from '@/components/QueryProvider'

export default function PartnerGroupLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="partner">
      <QueryProvider>{children}</QueryProvider>
    </RequireAuth>
  )
}
