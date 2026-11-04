'use client'

/**
 * Announcements from the AI Amplify team at the top of the dashboard
 * (GET /api/me/announcements). Each viewer can dismiss one; that's remembered
 * in this browser.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Megaphone, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

export type AnnouncementView = { id: string; title: string; body: string; linkUrl: string | null; linkLabel: string | null }

const KEY = 'smeep.announcements.dismissed'

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** One banner; also used as the live preview on the admin page. */
export function AnnouncementCard({ a, onDismiss, className }: { a: AnnouncementView; onDismiss?: () => void; className?: string }) {
  const external = !!a.linkUrl && /^https?:\/\//i.test(a.linkUrl)
  const label = a.linkLabel || 'Learn more'
  return (
    <section
      aria-label="Announcement"
      className={cn(
        'relative flex items-start gap-3.5 overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--ui-brand)_25%,var(--ui-line))] bg-ui-brand-soft px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand text-white">
        <Megaphone className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pe-6">
        <h2 className="text-[15px] font-semibold leading-snug text-ui-text">{a.title}</h2>
        <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ui-text/80">{a.body}</p>
        {a.linkUrl &&
          (external ? (
            <a
              href={a.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline"
            >
              {label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          ) : (
            <Link href={a.linkUrl} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline">
              {label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ))}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss: ${a.title}`}
          className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-white/60 hover:text-ui-text dark:hover:bg-black/20"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </section>
  )
}

export function AnnouncementBanner({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState<string[] | null>(null)
  useEffect(() => setDismissed(readDismissed()), [])
  const { data } = useQuery({
    queryKey: ['me', 'announcements'],
    queryFn: () => apiFetch<{ data: AnnouncementView[] }>('/api/me/announcements').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
  if (!dismissed || !data) return null
  const shown = data.filter((a) => !dismissed.includes(a.id))
  if (!shown.length) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage blocked: it comes back next visit */
    }
  }
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {shown.map((a) => (
        <AnnouncementCard key={a.id} a={a} onDismiss={() => dismiss(a.id)} />
      ))}
    </div>
  )
}
