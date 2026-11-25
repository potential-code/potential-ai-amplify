import type { Metadata } from 'next'
import AnnaPage from '@/views/dashboard/Anna'

export const metadata: Metadata = { title: "Ask Anna" }

export default function Page() {
  return <AnnaPage />
}
