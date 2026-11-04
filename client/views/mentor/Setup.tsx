'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CalendarDays, Check, CheckCircle2, Clock, Loader2, Lock, Mail, Users } from 'lucide-react'
import { Avatar, btn } from '@/components/kit'
import { AuthField, AuthAlert, PasswordToggle } from '@/components/auth/AuthField'
import { AuthSplit, AuthHeading, AsideSana, asideMuted } from '@/components/auth/AuthSplit'
import { cn } from '@/lib/utils'
import { refreshUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

interface TokenInfo {
  name: string
  email: string
}

function SetupForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [tokenError, setTokenError] = useState(false)
  const [loadingToken, setLoadingToken] = useState(true)

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Validate the token and pre-fill name + email
  useEffect(() => {
    if (!token) {
      setTokenError(true)
      setLoadingToken(false)
      return
    }

    apiFetch<TokenInfo>(`/api/mentor/setup-token?token=${encodeURIComponent(token)}`)
      .then((info) => setTokenInfo(info))
      .catch(() => setTokenError(true))
      .finally(() => setLoadingToken(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return

    setLoading(true)
    setSubmitError(null)
    try {
      // Creates the mentor account and signs in (session cookie).
      await apiFetch('/api/auth/amplify/mentor-setup', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      await refreshUser()
      router.push('/mentor/dashboard')
    } catch (err: unknown) {
      const body = err as { code?: string }
      if (body?.code === 'TOKEN_EXPIRED' || body?.code === 'TOKEN_NOT_FOUND') {
        setTokenError(true)
      } else {
        setSubmitError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loadingToken) {
    return (
      <div role="status" className="flex min-h-[200px] flex-col items-center justify-center gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface p-5 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-hidden />
        <span className="font-semibold text-ui-text">Checking your setup link</span>
        <span className="text-[13px] text-ui-muted">This takes a second.</span>
      </div>
    )
  }

  if (tokenError || !tokenInfo) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface p-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ui-danger-soft text-ui-danger">
          <AlertCircle className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <h2 className="text-[17px] font-semibold text-ui-text">Link expired or invalid</h2>
        <p className="text-sm leading-[1.55] text-ui-muted">
          This setup link has expired or has already been used. Email{' '}
          <strong className="font-semibold text-ui-text">info@potential.com</strong> and we&rsquo;ll send you a new
          one.
        </p>
        <a href="mailto:info@potential.com" className={cn(btn({ variant: 'secondary' }), 'mt-1')}>
          <Mail className="h-4 w-4" aria-hidden />
          Email info@potential.com
        </a>
      </div>
    )
  }

  const pct = Math.min(100, Math.round((password.length / 8) * 100))
  const enough = password.length >= 8

  return (
    <div className="flex flex-col gap-[26px]">
      <div className="flex items-center gap-2.5 rounded-[10px] bg-ui-ok-soft px-3.5 py-3 text-sm font-medium">
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-ui-ok" aria-hidden />
        <span className="text-ui-text">
          Your application was approved. Create a password to access your mentor dashboard.
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-3 rounded-[14px] border border-ui-line bg-ui-bg px-3.5 py-3">
          <Avatar name={tokenInfo.name} size={40} />
          <dl className="flex min-w-0 flex-col gap-px">
            <dt className="sr-only">Full name</dt>
            <dd className="text-[15px] font-semibold text-ui-text">{tokenInfo.name}</dd>
            <dt className="sr-only">Email address</dt>
            <dd className="truncate text-[13px] text-ui-muted">{tokenInfo.email}</dd>
          </dl>
          <Lock className="ml-auto h-4 w-4 shrink-0 text-ui-muted" aria-label="Set by your invitation, cannot be changed here" />
        </div>

        <div className="flex flex-col gap-2">
          <AuthField
            id="ms-pass"
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
          <div className="flex items-center gap-2.5">
            <span className="block h-1.5 flex-1 overflow-hidden rounded-[3px] bg-ui-surface-2" aria-hidden>
              <span
                className={cn('block h-full rounded-[3px] transition-[width]', enough ? 'bg-ui-ok' : 'bg-ui-brand')}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span aria-live="polite" className={cn('whitespace-nowrap text-xs', enough ? 'font-medium text-ui-ok' : 'text-ui-muted')}>
              {enough ? 'At least 8 characters' : `${password.length} of 8 characters minimum`}
            </span>
          </div>
        </div>

        {submitError && <AuthAlert>{submitError}</AuthAlert>}

        <button
          type="submit"
          disabled={loading || password.length < 8}
          aria-busy={loading || undefined}
          className={cn(btn({ size: 'lg' }), 'h-11 w-full text-[15px]')}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {loading ? 'Setting up your account' : 'Set password and continue'}
        </button>
      </form>
    </div>
  )
}

const STEPS = ['Applied', 'Approved', 'Set password', 'Dashboard']

function Steps() {
  return (
    <ol aria-label="Mentor onboarding progress" className="flex items-start">
      {STEPS.map((label, i) => {
        const done = i < 2
        const current = i === 2
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            {i > 0 && (
              <span aria-hidden className={cn('absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2', i <= 2 ? 'bg-ui-brand' : 'bg-ui-line')} style={{ marginRight: 14 }} />
            )}
            <span
              className={cn(
                'relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-ui-brand bg-ui-brand text-white',
                current && 'border-2 border-ui-brand bg-ui-surface text-ui-brand-text shadow-[0_0_0_4px_var(--ui-brand-soft)]',
                !done && !current && 'border-ui-line bg-ui-surface text-ui-muted',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-xs', current ? 'font-semibold text-ui-text' : 'font-medium text-ui-muted')}>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const NEXT = [
  { icon: Clock, title: 'Set your availability', body: 'Add the time slots learners can book.' },
  { icon: CalendarDays, title: 'Receive session bookings', body: 'See upcoming sessions on your dashboard and calendar.' },
  { icon: Users, title: 'Get to know your mentees', body: 'Keep track of the SME owners you work with.' },
]

function MentorAside() {
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-3">
        <h2 id="h-next" className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em]">
          Welcome to the AI Amplify mentor network.
        </h2>
        <p className={cn('text-base leading-[1.6]', asideMuted)}>
          Share your expertise with SMEs and startups in 50+ countries. Here is what you can do once you&apos;re in.
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {NEXT.map(({ icon: Icon, title, body }) => (
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
      <div className="mt-auto max-w-[460px]">
        <AsideSana size={44}>
          Learners find you on the Human Mentors page and book one of your open time slots. Sessions appear on your
          dashboard straight away.
        </AsideSana>
      </div>
    </>
  )
}

export default function MentorSetupPage() {
  return (
    <AuthSplit
      topPrompt={{ text: 'Already have an account?', ctaLabel: 'Sign in', ctaHref: '/login' }}
      asideLabelledBy="h-next"
      aside={<MentorAside />}
      width={420}
    >
      <div className="flex flex-col gap-[26px]">
        <Steps />
        <AuthHeading
          title="Set up your AI Amplify account"
          subtitle="Finish setting up your mentor account to start receiving session bookings."
        />
        <Suspense
          fallback={
            <div role="status" className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-hidden />
            </div>
          }
        >
          <SetupForm />
        </Suspense>
        <p className="text-[13px] text-ui-muted">
          Need help? Email{' '}
          <a href="mailto:info@potential.com" className="font-semibold text-ui-brand-text hover:underline">
            info@potential.com
          </a>
        </p>
      </div>
    </AuthSplit>
  )
}
