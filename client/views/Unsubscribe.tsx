'use client'

/**
 * Stop announcement emails from the link in an email, without signing in.
 * A button rather than on page load: mail scanners open links, and must not
 * unsubscribe anyone by doing so.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, MailX } from 'lucide-react'
import { Button, btn } from '@/components/kit'
import { REDESIGN_ASSETS } from '@/lib/constants'

export default function UnsubscribePage() {
  const token = useSearchParams()?.get('token') ?? ''
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>(token ? 'ask' : 'error')

  const confirm = async () => {
    setState('busy')
    try {
      const res = await fetch('/api/account/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ui-bg px-4 py-10">
      <Link href="/" className="mb-8">
        <img src={REDESIGN_ASSETS.logo.src} alt={REDESIGN_ASSETS.logo.alt} className="h-9 w-auto" />
      </Link>
      <div className="w-full max-w-[440px] rounded-[18px] border border-ui-line bg-ui-surface px-6 py-7 text-center shadow-ui">
        {state === 'done' ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-ui-ok" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-ui-text">You won&rsquo;t get announcement emails</h1>
            <p className="mt-2 text-sm text-ui-muted">
              Booking, reminder and sign-in emails still arrive. You can turn announcements back on from your profile.
            </p>
            <Link href="/dashboard/profile" className={btn({ variant: 'secondary', className: 'mt-5' })}>
              Go to my profile
            </Link>
          </>
        ) : state === 'error' ? (
          <>
            <MailX className="mx-auto h-10 w-10 text-ui-muted" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-ui-text">This link doesn&rsquo;t work</h1>
            <p className="mt-2 text-sm text-ui-muted">
              It may be incomplete or out of date. Sign in and turn off announcement emails from your profile instead.
            </p>
            <Link href="/dashboard/profile" className={btn({ variant: 'secondary', className: 'mt-5' })}>
              Sign in to my profile
            </Link>
          </>
        ) : (
          <>
            <MailX className="mx-auto h-10 w-10 text-ui-brand-text" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-ui-text">Stop announcement emails?</h1>
            <p className="mt-2 text-sm text-ui-muted">
              You&rsquo;ll stop getting news about new courses, events and the programme. Booking, reminder and sign-in emails still
              arrive.
            </p>
            <Button className="mt-5" onClick={confirm} disabled={state === 'busy'}>
              {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Stop announcement emails
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
