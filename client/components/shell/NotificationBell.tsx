'use client'

/**
 * The bell: in-app notifications (GET /api/me/notifications) with an unread
 * count. Opening a notification marks it read and goes to its page. Polls
 * every minute and on return to the tab.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { AlarmClock, Award, Bell, Building2, CalendarCheck, CalendarClock, CalendarPlus, CalendarX, CheckCheck, Flag, GraduationCap, Megaphone, PlayCircle, Radio, Trophy } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null }
/** `enabled` is false for learners until learner notifications are switched on. */
type Data = { items: Item[]; unread: number; enabled?: boolean }

const ICONS: Record<string, LucideIcon> = {
  session_booked: CalendarCheck,
  session_cancelled: CalendarX,
  badge: Trophy,
  organisation: Building2,
  event_booked: CalendarPlus,
  event_changed: CalendarClock,
  event_cancelled: CalendarX,
  event_reminder: AlarmClock,
  ai_report: Flag,
  session_reminder: CalendarClock,
  certificate: Award,
  event_new: Radio,
  event_recording: PlayCircle,
  course_nudge: GraduationCap,
  announcement: Megaphone,
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function NotificationBell({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => apiFetch<{ data: Data }>('/api/me/notifications').then((r) => r.data),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  })
  const unread = data?.unread ?? 0

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/me/notifications/${id}/read`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['me', 'notifications'] }),
  })
  const markAll = useMutation({
    mutationFn: () => apiFetch('/api/me/notifications/read-all', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['me', 'notifications'] }),
  })

  // Place the panel under the bell, kept on screen (it can sit in the sidebar).
  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(380, window.innerWidth - 16)
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8)
    setPos({ top: r.bottom + 8, left: variant === 'sidebar' ? Math.max(8, r.left) : left })
  }, [variant])
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    void qc.invalidateQueries({ queryKey: ['me', 'notifications'] })
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, place, qc])

  const openItem = (n: Item) => {
    if (!n.readAt) markRead.mutate(n.id)
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'
  // No bell at all while this account's notifications are switched off.
  if (data?.enabled === false) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center text-ui-text transition-colors',
          variant === 'header'
            ? 'h-9 w-9 rounded-[10px] border border-ui-line bg-ui-surface'
            : 'h-8 w-8 rounded-lg border border-transparent text-ui-muted hover:border-ui-line hover:bg-ui-surface-2 hover:text-ui-text',
        )}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -end-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ui-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ui-surface"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Rendered at the top of the page: the sidebar is its own stacking
          layer, so a panel inside it would sit under the page's cards. */}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[60] flex max-h-[min(520px,calc(100dvh-80px))] w-[min(380px,calc(100vw-16px))] flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui"
        >
          <div className="flex items-center gap-2 border-b border-ui-line px-4 py-3">
            <h2 className="flex-1 text-[15px] font-semibold text-ui-text">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ui-brand-text hover:bg-ui-brand-soft"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all as read
              </button>
            )}
          </div>
          {!data?.items.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ui-surface-2 text-ui-muted">
                <Bell className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-medium text-ui-text">You&rsquo;re all caught up</p>
              <p className="text-xs text-ui-muted">Bookings, reminders, certificates and new events show up here.</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {data.items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-ui-surface-2 focus-visible:bg-ui-surface-2 focus-visible:outline-none',
                        !n.readAt && 'bg-ui-brand-soft/40',
                      )}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
                        <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm leading-snug text-ui-text', !n.readAt && 'font-semibold')}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-[13px] leading-snug text-ui-muted">{n.body}</span>}
                        <span className="mt-1 block text-xs text-ui-muted">{ago(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ui-brand" aria-label="Unread" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
