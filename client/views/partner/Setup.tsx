'use client'

/**
 * A partner contact sets up their login from the emailed link
 * (/partner/setup?token=…), then lands on their organisation's dashboard.
 */
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Award, BarChart3, Building2, Loader2, Lock, Mail, Users } from 'lucide-react'
import { Avatar, btn } from '@/components/kit'
import { AuthField, AuthAlert, PasswordToggle } from '@/components/auth/AuthField'
import { AuthSplit, AuthHeading, asideMuted } from '@/components/auth/AuthSplit'
import { cn } from '@/lib/utils'
import { refreshUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

interface InviteInfo {
  fullName: string
  email: string
  organisation: string
}

function SetupForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setInvalid(true)
      setChecking(false)
      return
    }
    apiFetch<{ data: InviteInfo }>(`/api/partner/setup-token?token=${encodeURIComponent(token)}`)
      .then((r) => setInfo(r.data))
      .catch(() => setInvalid(true))
      .finally(() => setChecking(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return
    setSaving(true)
    setSubmitError(null)
    try {
      await apiFetch('/api/auth/amplify/partner-setup', { method: 'POST', body: JSON.stringify({ token, password }) })
      await refreshUser()
      router.push('/partner')
    } catch (err: unknown) {
      const body = err as { code?: string; status?: number }
      if (body?.code === 'INVITE_INVALID') setInvalid(true)
      else if (body?.status === 429) setSubmitError('Too many tries. Wait a minute and try again.')
      else setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return (
      <div role="status" className="flex min-h-[200px] flex-col items-center justify-center gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface p-5 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-hidden />
        <span className="font-semibold text-ui-text">Checking your setup link</span>
      </div>
    )
  }

  if (invalid || !info) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface p-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ui-danger-soft text-ui-danger">
          <AlertCircle className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <h2 className="text-[17px] font-semibold text-ui-text">Link expired or already used</h2>
        <p className="text-sm leading-[1.55] text-ui-muted">
          Setup links work once, for 7 days. Email <strong className="font-semibold text-ui-text">info@potential.com</strong> and
          we&rsquo;ll send you a new one. If you already set up your login, sign in instead.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <a href="/login" className={btn()}>
            Sign in
          </a>
          <a href="mailto:info@potential.com" className={btn({ variant: 'secondary' })}>
            <Mail className="h-4 w-4" aria-hidden />
            Email us
          </a>
        </div>
      </div>
    )
  }

  const enough = password.length >= 8
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center gap-2.5 rounded-[10px] bg-ui-brand-soft px-3.5 py-3 text-sm font-medium text-ui-text">
        <Building2 className="h-[18px] w-[18px] shrink-0 text-ui-brand-text" aria-hidden />
        <span>
          Partner dashboard for <strong className="font-semibold">{info.organisation}</strong>
        </span>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-3 rounded-[14px] border border-ui-line bg-ui-bg px-3.5 py-3">
          <Avatar name={info.fullName} size={40} />
          <dl className="flex min-w-0 flex-col gap-px">
            <dt className="sr-only">Full name</dt>
            <dd className="text-[15px] font-semibold text-ui-text">{info.fullName}</dd>
            <dt className="sr-only">Email address</dt>
            <dd className="truncate text-[13px] text-ui-muted">{info.email}</dd>
          </dl>
          <Lock className="ml-auto h-4 w-4 shrink-0 text-ui-muted" aria-label="Set by your invitation, cannot be changed here" />
        </div>
        <AuthField
          id="ps-pass"
          type={showPassword ? 'text' : 'password'}
          label="Create password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock />}
          validator={(v) => (!v ? 'Enter a password' : v.length < 8 ? 'Use at least 8 characters' : null)}
          trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
        />
        <p aria-live="polite" className={cn('-mt-2 text-xs', enough ? 'font-medium text-ui-ok' : 'text-ui-muted')}>
          {enough ? 'At least 8 characters' : `${password.length} of 8 characters minimum`}
        </p>
        {submitError && <AuthAlert>{submitError}</AuthAlert>}
        <button type="submit" disabled={saving || !enough} aria-busy={saving || undefined} className={cn(btn({ size: 'lg' }), 'h-11 w-full text-[15px]')}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {saving ? 'Setting up your login' : 'Set password and continue'}
        </button>
      </form>
    </div>
  )
}

const WHAT = [
  { icon: Users, title: 'Who has joined', body: 'Everyone who signed up with your organisation’s link.' },
  { icon: BarChart3, title: 'How they’re learning', body: 'Course progress, activity and learning gain from pre-test to final exam.' },
  { icon: Award, title: 'What they’ve achieved', body: 'Courses completed and certificates, ready to download.' },
]

function PartnerAside() {
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-3">
        <h2 id="h-partner" className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em]">
          Follow your learners on AI Amplify.
        </h2>
        <p className={cn('text-base leading-[1.6]', asideMuted)}>A read-only dashboard of your organisation&rsquo;s learners.</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {WHAT.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3.5 rounded-[14px] border border-white/10 bg-white/[0.05] px-4 py-3.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#cfadf0]/[0.14] text-[#cfadf0]">
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{title}</span>
              <span className={cn('text-sm', asideMuted)}>{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function PartnerSetupPage() {
  return (
    <AuthSplit
      topPrompt={{ text: 'Already set up?', ctaLabel: 'Sign in', ctaHref: '/login' }}
      asideLabelledBy="h-partner"
      aside={<PartnerAside />}
      width={420}
    >
      <div className="flex flex-col gap-[26px]">
        <AuthHeading title="Set up your partner login" subtitle="Create a password to open your organisation's dashboard." />
        <Suspense
          fallback={
            <div role="status" className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-hidden />
            </div>
          }
        >
          <SetupForm />
        </Suspense>
      </div>
    </AuthSplit>
  )
}
