'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'

export function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell role="admin">{children}</AppShell>
}
