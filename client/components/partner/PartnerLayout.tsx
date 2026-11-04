'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'

export function PartnerLayout({ children }: { children: ReactNode }) {
  return <AppShell role="partner">{children}</AppShell>
}
