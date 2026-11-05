/**
 * A question handed to Ask Anna from another page (the Home page's Ask bar).
 * Ask Anna reads it once on load and sends it.
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
