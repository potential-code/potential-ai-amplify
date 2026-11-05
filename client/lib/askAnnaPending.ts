/**
 * A question handed to Ask Anna from another page (the Home page's Ask bar,
 * "Learn with Anna" on a course). Ask Anna reads it once on load and sends it.
 */
export const ASK_ANNA_PENDING_KEY = 'smeep.askSana.pending'

/** Leaves a question for Ask Anna; the caller then opens /dashboard/anna. */
export function handOffToAnna(question: string): void {
  try {
    if (question.trim()) sessionStorage.setItem(ASK_ANNA_PENDING_KEY, question.trim())
  } catch {
    /* storage blocked: Anna still opens, without the question */
  }
}

/** The question "Learn with Anna" asks about a course (and the unit, when known). */
export function learnWithAnnaQuestion(courseTitle: string, unitTitle?: string | null): string {
  const where = unitTitle ? `the unit "${unitTitle}" in my course "${courseTitle}"` : `my course "${courseTitle}"`
  return `Help me understand ${where}. Explain the key ideas simply, with an example for my business.`
}
