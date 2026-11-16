'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { consentStore, type Milestone } from '@/lib/consent/store'
import { useConsentState } from './CookieConsent'

/**
 * Learner area only: reports a newly completed first lesson (first_step
 * badge) or newly issued certificate to GTM, with no details. AI Amplify's
 * learner notifications (the bell) are switched off, so this reads the rows
 * the server writes once per milestone (GET /api/me/milestones) instead.
 * Polls only while GTM runs on a tracked page; renders nothing.
 */
export function MilestoneWatcher() {
  const { gtmId, tracked } = useConsentState()
  const { data } = useQuery({
    queryKey: ['me', 'milestones'],
    queryFn: () => apiFetch<{ data: { items: Milestone[] } }>('/api/me/milestones').then((r) => r.data.items),
    enabled: !!gtmId && tracked,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  })
  useEffect(() => {
    if (data) consentStore.noteMilestones(data)
  }, [data])
  return null
}
