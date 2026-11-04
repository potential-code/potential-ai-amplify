import type { Metadata } from 'next'
import { Suspense } from 'react'
import UnsubscribePage from '@/views/Unsubscribe'

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false } }

export default function Page() {
  return (
    <Suspense>
      <UnsubscribePage />
    </Suspense>
  )
}
