'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { btn, inputClass } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { FOOTER, NEWSLETTER } from '@/lib/constants/content'
import { cn } from '@/lib/utils'

export function LandingCommunity() {
  return (
    <section id="community" aria-labelledby="h-community" className="scroll-mt-[68px] py-9">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-stretch gap-6 px-4 min-[900px]:grid-cols-2 min-[900px]:px-10">
        <div className="flex flex-col justify-center gap-3.5">
          <h2 id="h-community" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
            Meet our community
          </h2>
          <p className="text-base leading-[1.55] text-ui-muted">
            SME owners learn and grow with AI together here. We would love to share your story and expertise with
            the community.
          </p>
          <a href={`mailto:${FOOTER.contactEmail}`} className="self-start text-sm font-semibold text-ui-brand-text hover:underline">
            Share your story with {FOOTER.contactEmail}
          </a>
          <NewsletterForm />
        </div>

        <div className="relative flex min-h-[300px] flex-col justify-end gap-4 overflow-hidden rounded-[14px] bg-[#1c1029] p-7 text-white">
          <img
            src="/images/redesign/world-map.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#3b1c54] via-[#3b1c54]/60 to-[#3b1c54]/0" />
          <div className="relative flex flex-col gap-4">
            <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]">
              Ready to put AI to work in your business?
            </h2>
            <p className="text-[15px] leading-[1.55] text-[#e7d6f9]">
              Join AI Amplify with your invite code. Start the six core AI courses, meet your mentors and ask Anna
              anything.
            </p>
            <div className="mt-1 flex flex-wrap gap-2.5">
              <Link href="/sign-up" className={cn(btn(), 'border-white bg-white text-[#652d90] hover:bg-[#F4ECFE]')}>
                Register now
              </Link>
              <Link href="/login" className={cn(btn(), 'border-white/50 bg-transparent text-white hover:bg-white/10')}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Newsletter sign-up (POST /api/newsletter/subscribe), same behaviour as the old footer form. */
function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await apiFetch('/api/newsletter/subscribe', { method: 'POST', body: JSON.stringify({ email }) })
      setSubscribed(true)
      setEmail('')
    } catch (err: unknown) {
      const body = err as { error?: { code?: string } }
      setError(
        body?.error?.code === 'VALIDATION_ERROR'
          ? 'Please enter a valid email address.'
          : body?.error?.code === 'RATE_LIMITED'
            ? 'Too many sign-ups from this network. Please try again later.'
            : 'We could not sign you up just now. Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="h-news"
      noValidate
      className="mt-1 flex flex-col gap-2 border-t border-ui-line pt-4"
    >
      <p className="text-sm text-ui-muted">
        <strong id="h-news" className="font-semibold text-ui-text">
          {NEWSLETTER.heading}.
        </strong>{' '}
        AI playbooks, new AI tools and live event invites.
      </p>
      <div className="flex max-w-[460px] gap-2">
        <label htmlFor="nl-email" className="sr-only">
          Email address
        </label>
        <input
          id="nl-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          placeholder={NEWSLETTER.placeholder}
          aria-invalid={!!error}
          aria-describedby="nl-help"
          className={cn(inputClass, 'min-w-0 flex-1', error && 'border-ui-danger')}
        />
        <button type="submit" disabled={sending || subscribed} className={btn()}>
          {subscribed ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              Subscribed
            </>
          ) : sending ? (
            'Subscribing'
          ) : (
            NEWSLETTER.ctaLabel
          )}
        </button>
      </div>
      <span id="nl-help" role={error || subscribed ? 'status' : undefined} className={cn('text-xs', error ? 'text-ui-danger' : 'text-ui-muted')}>
        {error ?? `${subscribed ? 'You are on the list. ' : ''}No spam. To unsubscribe, email ${FOOTER.contactEmail}.`}
      </span>
    </form>
  )
}
