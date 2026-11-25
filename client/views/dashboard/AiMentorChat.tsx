'use client'

import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { MentorChatPanel } from '@/components/dashboard/MentorChatPanel'

type Props = {
  botId: string
  name: string
  specialty: string
  description: string
  avatar: string
}

/**
 * An AI mentor conversation on the full-bleed Sana Studio canvas — same shell
 * as Ask Anna, the examiner and Interactive Learning. The back link lives in
 * the panel's glass header.
 */
export default function AiMentorChatPage({ botId, name, specialty, avatar }: Props) {
  return (
    <DashboardLayout fullBleed>
      <MentorChatPanel botId={botId} name={name} specialty={specialty} avatar={avatar} />
    </DashboardLayout>
  )
}
