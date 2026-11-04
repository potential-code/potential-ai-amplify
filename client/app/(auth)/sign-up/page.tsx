import type { Metadata } from 'next'
import SignUpPage from '@/views/SignUp'

export const metadata: Metadata = { title: 'Join AI Amplify' }

// AI Amplify is invite-only: the form (and Anna's sign-up chat) ask for an
// invite code, and the server refuses any sign-up without a valid, unused one.
// An admin's invite link (/sign-up?code=…) fills the code in.
export default function Page() {
  return <SignUpPage />
}
