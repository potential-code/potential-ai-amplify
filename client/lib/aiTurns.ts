'use client'

/**
 * Saving AI answers for learners who belong to an organisation (their partner
 * can read them; they're told at sign-up and on their profile). Learners who
 * aren't in one send nothing: membership is checked once per page load.
 */

let membership: Promise<boolean> | null = null
const sent = new Set<string>()

function isOrganisationMember(): Promise<boolean> {
  membership ??= fetch('/api/me/organisation', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { data?: { id: string } | null } | null) => !!b?.data)
    .catch(() => false)
  return membership
}

/** After joining or leaving an organisation, look again. */
export function resetOrganisationMembership(): void {
  membership = null
}

export function recordAiTurn(turn: { surface: string; messageId: string; question?: string; answer: string }): void {
  const key = `${turn.surface}:${turn.messageId}`
  if (sent.has(key) || !turn.answer.trim()) return
  sent.add(key)
  void isOrganisationMember().then((member) => {
    if (!member) return
    void fetch('/api/me/ai-turns', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...turn, question: turn.question ?? null }),
    }).catch(() => {
      // Not saved this time; a later render of the same answer won't retry (that's fine).
    })
  })
}
