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
 * Polls only while GTM actually runs on a tracked page (`running`; a tracked
 * page of a document where GTM never started doesn't count). The query and
 * the store's "seen" set are per learner (`userId`), so a different learner
 * signing in on the same tab never sees the previous one's milestones as new.
 * Renders nothing.
 */
export function MilestoneWatcher({ userId }: { userId: string }) {
  const { running } = useConsentState()
  const { data } = useQuery({
    queryKey: ['me', 'milestones', userId],
    queryFn: () => apiFetch<{ data: { items: Milestone[] } }>('/api/me/milestones').then((r) => r.data.items),
    enabled: running && !!userId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  })
  useEffect(() => {
    if (data) consentStore.noteMilestones(data, userId)
  }, [data, userId])
  return null
}
