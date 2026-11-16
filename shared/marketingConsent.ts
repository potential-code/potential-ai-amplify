/**
 * The optional marketing box on both sign-up paths (the form and Anna's chat)
 * and the setting on the learner's profile. The server stores this constant
 * as the wording the learner agreed to; it never trusts text from the client.
 * Changing it changes what new opt-ins agree to, so treat it as a legal text.
 * AI Amplify is a paid programme: keep the wording in line with that.
 */
export const MARKETING_CONSENT_TEXT =
  "Send me programme updates, offers and event invitations from AI Amplify by Potential.org. You can unsubscribe at any time.";
