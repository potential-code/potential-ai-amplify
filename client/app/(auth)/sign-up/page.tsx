import { redirect } from 'next/navigation'
import SignUpPage from '@/views/SignUp'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

async function hasValidInviteCode(code: string | undefined): Promise<boolean> {
  if (!code || !code.trim()) return false
  try {
    const res = await fetch(
      `${API_BASE}/api/auth/check-coupon?code=${encodeURIComponent(code.trim())}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return false
    const body = (await res.json()) as { success: boolean; data?: { valid: boolean } }
    return Boolean(body.success && body.data?.valid)
  } catch {
    return false
  }
}

// Registration is not self-service — public visitors must never reach this
// page (see LandingRegistrationChat's registration-redirect guardrail and the
// landing page CTA removal). The one exception is an admin-issued invite
// link (client/views/admin/Invites.tsx generates `/sign-up?code=<code>`) —
// those carry a real, single-use invite code, so we only render the page
// when that code checks out against the backend. Everyone else is redirected
// home before any registration UI ever renders.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams

  if (!(await hasValidInviteCode(code))) {
    redirect('/')
  }

  return <SignUpPage />
}
