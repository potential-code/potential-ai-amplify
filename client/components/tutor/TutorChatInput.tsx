'use client'

/**
 * The Multi Learning composer: the shared Anna composer with dictation in the
 * learner's language (browser speech recognition) and the tutor's localised
 * placeholder. The voice-replies toggle lives in the page header.
 */

import type { CopilotChatInputProps } from '@copilotkit/react-core/v2'
import { SanaChatInput } from '@/components/learning-ui/SanaChatInput'
import { useTutor } from './context'
import { useNarrow } from '@/lib/useNarrow'

export function TutorChatInput(props: CopilotChatInputProps) {
  const { ui, lang } = useTutor()
  // On a phone the full hint is cut off; the mic button beside it says the rest.
  const narrow = useNarrow()
  return <SanaChatInput {...props} dictationLang={lang} placeholder={narrow ? ui.placeholderShort : ui.placeholder} dictation />
}
