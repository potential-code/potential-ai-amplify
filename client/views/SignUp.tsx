'use client'

import { useId, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  Globe,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Tag,
  User,
} from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { btn } from '@/components/kit'
import { AuthField, AuthAlert, PasswordToggle, authInputClass } from '@/components/auth/AuthField'
import { AuthSplit, AuthHeading, asideMuted } from '@/components/auth/AuthSplit'
import { homeFor, refreshUser } from '@/lib/auth'
import { CodeForm, codeErrorMessage } from '@/components/auth/CodeForm'
import { apiFetch } from '@/lib/api'
import { LEGAL_LINKS } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

// CopilotKit is heavy; only load Anna's chat when the visitor picks it.
const LandingRegistrationChat = dynamic(
  () => import('@/components/landing/LandingRegistrationChat').then((m) => m.LandingRegistrationChat),
  { ssr: false },
)

const COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

const validateName = (v: string) => (!v || v.trim().length < 2 ? 'Tell us your full name' : null)
const validateEmail = (v: string) =>
  !v
    ? 'Enter your email'
    : !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)
    ? 'Enter a valid email address'
    : null
const validatePassword = (v: string) =>
  !v ? 'Choose a password' : v.length < 8 ? 'Use at least 8 characters' : null

/** Errors from Better Auth endpoints put `code` at the top level. */
type ApiErr = { code?: string; status?: number; message?: string; error?: { code?: string; errors?: Record<string, string[]> } }

type JoiningOrg = { name: string; code: string }

function SignUpForm({ org, onOrgGone }: { org: JoiningOrg | null; onOrgGone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const countryId = useId()
  const router = useRouter()

  const [prefillCode, setPrefillCode] = useState('')
  const hasInviteCode = prefillCode.length > 0

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    country: '',
    couponCode: '',
    agreed: false,
  })
  const [touched, setTouched] = useState({ country: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  // The availability check couldn't run (network). Don't block sign-up on it:
  // the server checks the email again when the code is sent.
  const [emailCheckFailed, setEmailCheckFailed] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)
  // Step two: the 6-digit code that proves the email before the account exists.
  const [step, setStep] = useState<'details' | 'code'>('details')

  // Read invite/coupon code from the URL client-side only, after mount —
  // keeps useId stable between server and client (no useSearchParams/Suspense).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code') ?? ''
    if (code) {
      setPrefillCode(code)
      setForm((prev) => ({ ...prev, couponCode: code }))
    }
  }, [])

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  const countryError = touched.country && !form.country ? 'Pick your country' : null

  const canSubmit =
    form.agreed &&
    form.fullName.trim().length >= 2 &&
    !validateEmail(form.email) &&
    (emailAvailable === true || emailCheckFailed) &&
    !emailChecking &&
    form.password.length >= 8 &&
    !!form.country &&
    // AI Amplify is invite-only: every account redeems an invite code.
    form.couponCode.trim().length > 0

  async function handleEmailBlur() {
    if (validateEmail(form.email)) return
    setEmailChecking(true)
    try {
      const res = await apiFetch<{ success: boolean; data: { available: boolean } }>('/api/account/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      })
      const available = res.data.available
      setEmailAvailable(available)
      setEmailError(available ? null : 'An account with this email already exists')
    } catch (err: unknown) {
      const body = err as { error?: { code?: string } }
      if (body?.error?.code === 'VALIDATION_ERROR') {
        setEmailError('Enter a valid email address')
      } else {
        setEmailCheckFailed(true)
      }
    } finally {
      setEmailChecking(false)
    }
  }

  // The availability check used to run only on the email field's blur — a user
  // whose browser autofilled the form (no blur ever fired) faced a submit
  // button that was silently disabled forever. Debounce the same check off the
  // value itself so a valid email always gets verified.
  useEffect(() => {
    if (validateEmail(form.email)) return
    if (emailAvailable !== null) return // already checked this value via blur
    const id = window.setTimeout(() => void handleEmailBlur(), 600)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email, emailAvailable])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ country: true })
    setEmailError(null)
    setCouponError(null)
    setFormError(null)

    if (
      !form.agreed ||
      validateName(form.fullName) ||
      validateEmail(form.email) ||
      validatePassword(form.password) ||
      !form.country
    ) return
    if (!form.couponCode.trim()) {
      setCouponError('Enter the invite code you were given')
      return
    }

    setLoading(true)
    try {
      await apiFetch('/api/auth/amplify/sign-up/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      })
      setStep('code')
    } catch (err: unknown) {
      const e = err as ApiErr
      setFormError(e?.status === 429 || e?.code === 'RATE_LIMITED' ? 'Too many tries. Please wait a minute.' : "Couldn't send the code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  /** Swaps the code for a verified token, then creates the account and signs in. */
  async function finishSignUp(code: string): Promise<string | null> {
    let verifiedToken: string
    try {
      const res = await apiFetch<{ verifiedToken: string }>('/api/auth/amplify/sign-up/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email, code }),
      })
      verifiedToken = res.verifiedToken
    } catch (err: unknown) {
      return codeErrorMessage(err as ApiErr)
    }
    try {
      await apiFetch('/api/auth/amplify/sign-up', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          country: form.country,
          couponCode: form.couponCode.trim(),
          ...(org ? { orgCode: org.code } : {}),
          verifiedToken,
        }),
      })
    } catch (err: unknown) {
      const e = err as ApiErr
      setStep('details')
      if (e?.code === 'EMAIL_EXISTS') setEmailError('An account with this email already exists')
      else if (e?.code === 'INVALID_COUPON') setCouponError('Invalid or already used invite code')
      else if (e?.code === 'INVALID_ORG_CODE') {
        onOrgGone()
        setFormError('That organisation link has stopped working. You can sign up without it, or ask the organisation for a new link.')
      }
      else setFormError('Something went wrong. Please try again.')
      return null
    }
    const user = await refreshUser()
    router.push(user ? homeFor(user.role) : '/dashboard')
    return null
  }

  const emailTaken = emailError === 'An account with this email already exists'

  if (step === 'code') {
    return (
      <CodeForm
        email={form.email}
        intro={
          <>
            To finish, enter the 6-digit code we sent to <strong className="font-semibold">{form.email}</strong>.
          </>
        }
        submitLabel="Create my account"
        submittingLabel="Creating your account"
        onSubmit={finishSignUp}
        onResend={async () => {
          try {
            await apiFetch('/api/auth/amplify/sign-up/send-code', { method: 'POST', body: JSON.stringify({ email: form.email }) })
            return null
          } catch {
            return "Couldn't send the code. Please try again."
          }
        }}
        onBack={() => setStep('details')}
        backLabel="Change my details"
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
      <AuthField
        id="su-name"
        label="Full name"
        autoComplete="name"
        required
        placeholder="e.g. Rashid Al Amri"
        value={form.fullName}
        onChange={(e) => update('fullName', e.target.value)}
        icon={<User />}
        validator={validateName}
      />
      <AuthField
        id="su-email"
        type="email"
        label="Email address"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={form.email}
        onChange={(e) => {
          update('email', e.target.value)
          setEmailError(null)
          setEmailAvailable(null)
          setEmailCheckFailed(false)
        }}
        onBlur={handleEmailBlur}
        icon={<Mail />}
        validator={validateEmail}
        externalError={
          emailTaken ? (
            <>
              An account with this email already exists.{' '}
              <Link href="/login" className="font-semibold underline">
                Sign in instead
              </Link>
            </>
          ) : (
            emailError
          )
        }
        help={
          emailChecking ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Checking this email
            </span>
          ) : emailAvailable ? (
            <span className="text-ui-ok">This email is available.</span>
          ) : emailCheckFailed ? (
            "We couldn't check this email just now. You can still continue."
          ) : (
            "We check that this email isn't already registered."
          )
        }
        trailing={
          emailChecking ? (
            <span className="inline-flex h-9 w-9 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-ui-muted" aria-hidden />
            </span>
          ) : undefined
        }
      />
      <AuthField
        id="su-pass"
        type={showPassword ? 'text' : 'password'}
        label="Password"
        autoComplete="new-password"
        required
        value={form.password}
        onChange={(e) => update('password', e.target.value)}
        icon={<Lock />}
        validator={validatePassword}
        help="Use at least 8 characters."
        trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
      />

      {/* Country gets the wider column: names like "United Arab Emirates"
          were cut off at half width. */}
      <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={countryId} className="text-[13px] font-semibold text-ui-text">
            Country
          </label>
          <div className="relative flex items-center">
            <Globe className="pointer-events-none absolute left-3 h-[18px] w-[18px] text-ui-muted" aria-hidden />
            <select
              id={countryId}
              required
              value={form.country}
              onChange={(e) => {
                update('country', e.target.value)
                setTouched((t) => ({ ...t, country: true }))
              }}
              onBlur={() => setTouched((t) => ({ ...t, country: true }))}
              aria-invalid={countryError ? true : undefined}
              aria-describedby={countryError ? `${countryId}-err` : undefined}
              className={cn(
                authInputClass,
                'cursor-pointer appearance-none pl-10 pr-9',
                !form.country && 'text-ui-muted',
                countryError && 'border-ui-danger',
              )}
            >
              <option value="" disabled>
                Select country
              </option>
              {COUNTRIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ui-muted" aria-hidden />
          </div>
          {countryError && (
            <p id={`${countryId}-err`} className="text-xs text-ui-danger">
              {countryError}
            </p>
          )}
        </div>

        {hasInviteCode ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ui-text">Invite code</span>
            <div className="flex h-11 items-center gap-2 rounded-[10px] bg-ui-ok-soft px-3 text-[13px] text-ui-ok">
              <CheckCircle2 className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono tracking-[0.12em] text-ui-text">{form.couponCode}</span>
              <span className="font-semibold max-[520px]:hidden">Applied</span>
            </div>
            {couponError && <p className="text-xs text-ui-danger">{couponError}</p>}
          </div>
        ) : (
          <AuthField
            id="su-code"
            label="Invite code"
            placeholder="CODE"
            autoCapitalize="characters"
            value={form.couponCode}
            onChange={(e) => {
              update('couponCode', e.target.value.toUpperCase())
              setCouponError(null)
            }}
            icon={<Tag />}
            externalError={couponError}
            className="tracking-[0.12em]"
          />
        )}
      </div>

      <label className="mt-0.5 flex cursor-pointer items-start gap-2 text-[13px] leading-normal text-ui-muted">
        <input
          type="checkbox"
          required
          checked={form.agreed}
          onChange={(e) => update('agreed', e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-ui-brand"
        />
        <span>
          By registering, I agree to the{' '}
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">
            Terms of Use
          </a>{' '}
          and{' '}
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="font-semibold text-ui-brand-text hover:underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>

      {formError && <AuthAlert>{formError}</AuthAlert>}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        aria-busy={loading || undefined}
        className={cn(btn({ size: 'lg' }), 'h-11 w-full text-[15px]')}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {loading ? 'Sending your code' : 'Continue'}
      </button>
    </form>
  )
}

type Mode = 'form' | 'sana'

export default function SignUpPage() {
  const [mode, setMode] = useState<Mode>('form')
  const [autoStart, setAutoStart] = useState(false)
  // /sign-up?org=CODE: the learner joins that partner organisation (an invite
  // code is still needed; links can carry both: ?code=INVITE&org=CODE).
  const [org, setOrg] = useState<JoiningOrg | null>(null)
  const [orgGone, setOrgGone] = useState(false)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('org')?.trim()
    if (!code) return
    apiFetch<{ data: JoiningOrg }>(`/api/organisations/join/${encodeURIComponent(code)}`)
      .then((r) => setOrg(r.data))
      .catch(() => setOrgGone(true))
  }, [])

  // /sign-up?with=sana (the homepage's "I want to register") opens Anna and starts registration.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('with') === 'sana') {
      setMode('sana')
      setAutoStart(true)
    }
  }, [])

  function startSana() {
    setMode('sana')
    setAutoStart(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AuthSplit
      topPrompt={{ text: 'Already a member?', ctaLabel: 'Sign in', ctaHref: '/login' }}
      asideLabelledBy={org ? 'h-org-join' : 'h-sana-reg'}
      aside={org ? <OrgAside name={org.name} /> : <SanaAside onStart={startSana} active={mode === 'sana'} />}
      width={420}
    >
      <AuthHeading
        title="Join AI Amplify today"
        subtitle="Empower your business with AI. AI Amplify is invite-only, and it only takes a minute."
      />

      {org && (
        <div role="status" className="flex items-start gap-3 rounded-[12px] border border-[color-mix(in_srgb,var(--ui-brand)_25%,var(--ui-line))] bg-ui-brand-soft px-4 py-3">
          <Building2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ui-brand-text" aria-hidden />
          <p className="text-sm leading-relaxed text-ui-text">
            You&rsquo;re joining with <strong className="font-semibold">{org.name}</strong>. {org.name} will see your learning record (courses, exams,
            certificates, events and mentor sessions) and your chats with Anna and the AI mentors.
          </p>
        </div>
      )}
      {orgGone && !org && (
        <p role="status" className="rounded-[12px] bg-ui-surface-2 px-4 py-3 text-sm text-ui-muted">
          That organisation link isn&rsquo;t active any more. You can still sign up on your own.
        </p>
      )}

      {!org && (
      <div
        role="group"
        aria-label="How do you want to register?"
        className="grid grid-cols-2 gap-1 rounded-[10px] bg-ui-surface-2 p-1"
      >
        {(
          [
            { value: 'form', label: 'Fill in the form' },
            { value: 'sana', label: 'Register with Anna' },
          ] as const
        ).map((o) => {
          const on = mode === o.value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(o.value)}
              className={cn(
                'inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                on ? 'bg-ui-surface text-ui-text shadow-[0_1px_2px_rgba(23,23,28,.1)]' : 'text-ui-muted hover:text-ui-text',
              )}
            >
              {o.value === 'form' ? (
                <FileText className="h-4 w-4" aria-hidden />
              ) : (
                <img src="/images/redesign/anna-avatar-96.png" alt="" className="h-5 w-5 rounded-full object-cover object-top" />
              )}
              <span className="max-[360px]:text-[13px]">{o.label}</span>
            </button>
          )
        })}
      </div>
      )}

      {mode === 'form' || org ? (
        <SignUpForm org={org} onOrgGone={() => { setOrg(null); setOrgGone(true) }} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative h-[560px] max-h-[calc(100dvh-160px)] min-h-[420px]">
            <LandingRegistrationChat autoStart={autoStart} />
          </div>
          <p className="flex items-start gap-2 text-xs leading-normal text-ui-muted">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            No password needed. Anna verifies your email with a code you enter in a secure card, never in the chat.
          </p>
        </div>
      )}

      <p className="text-sm text-ui-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-ui-brand-text hover:underline">
          Sign in
        </Link>
      </p>
    </AuthSplit>
  )
}

const SANA_STEPS: { label: string; icon: typeof User }[] = [
  { label: 'Full name', icon: User },
  { label: 'Email address', icon: Mail },
  { label: 'Verify email code', icon: ShieldCheck },
  { label: 'Country', icon: Globe },
  { label: 'Invite code', icon: Tag },
  { label: 'Review and confirm', icon: CheckCircle2 },
]

/** The side panel when signing up with an organisation's link: what joining means. */
function OrgAside({ name }: { name: string }) {
  const points = [
    'The same courses, AI mentors and live events as every AI Amplify learner.',
    `${name} follows your progress: courses, exam answers, certificates, events, mentor sessions, and your chats with Anna and the AI mentors.`,
    'You can leave the organisation any time from your profile.',
  ]
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-3">
        <h2 id="h-org-join" className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em]">
          Join AI Amplify with {name}.
        </h2>
      </div>
      <ul className="flex flex-col gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3 rounded-[14px] border border-white/10 bg-white/[0.05] px-4 py-3.5">
            <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#cfadf0]" aria-hidden />
            <span className={cn('text-[15px] leading-normal', asideMuted)}>{p}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function SanaAside({ onStart, active }: { onStart: () => void; active: boolean }) {
  const bubble = 'rounded-[4px_14px_14px_14px] bg-white/[0.09] px-3 py-2.5 text-sm leading-normal'
  return (
    <>
      <div className="flex items-center gap-3.5">
        <img
          src="/images/redesign/anna-avatar-96.png"
          alt=""
          className="h-14 w-14 rounded-full object-cover object-top shadow-[0_0_0_3px_rgba(207,173,240,.35)]"
        />
        <div className="flex flex-col gap-0.5">
          <h2 id="h-sana-reg" className="text-2xl font-semibold tracking-[-0.02em]">
            Rather chat? Register with Anna.
          </h2>
          <span className={cn('text-sm', asideMuted)}>No password needed. Anna verifies your email with a code.</span>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.05] p-[18px]">
        <div className="flex items-start gap-2.5">
          <img src="/images/redesign/anna-avatar-96.png" alt="" className="h-7 w-7 shrink-0 rounded-full object-cover object-top" />
          <p className={bubble}>Hi! I&apos;m Anna. Have an invite? Register here, or log in to your account.</p>
        </div>
        <p className="self-end rounded-[14px_4px_14px_14px] bg-[#8c50bd] px-3 py-2 text-sm">I want to register</p>
        <div className="flex items-start gap-2.5">
          <img src="/images/redesign/anna-avatar-96.png" alt="" className="h-7 w-7 shrink-0 rounded-full object-cover object-top" />
          <p className={bubble}>Great. What&apos;s your full name?</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold">Anna asks for one thing at a time</span>
        <ol className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-sm">
          {SANA_STEPS.map(({ label, icon: Icon }) => (
            <li key={label} className="flex items-center gap-2.5">
              <Icon className="h-[18px] w-[18px] shrink-0 text-[#cfadf0]" aria-hidden />
              {label}
            </li>
          ))}
        </ol>
      </div>
      {!active && (
        <button
          type="button"
          onClick={onStart}
          className={cn(btn(), 'self-start border-white bg-white text-[#652d90] hover:bg-[#F4ECFE]')}
        >
          Start with Anna
        </button>
      )}
      <p className={cn('mt-auto flex items-start gap-2.5 border-t border-white/[0.14] pt-[18px] text-[13px] leading-normal', asideMuted)}>
        <Lock className="h-[18px] w-[18px] shrink-0 text-[#cfadf0]" aria-hidden />
        <span>
          Your information is handled securely. The verification code is entered only in the secure card and is
          never visible in the chat.
        </span>
      </p>
    </>
  )
}
