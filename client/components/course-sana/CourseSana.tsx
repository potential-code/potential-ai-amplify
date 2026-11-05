'use client'

/**
 * Anna, floating on a course page: a launcher at the bottom right that opens
 * her chat in its own panel (a bottom sheet on phones), the way the Potential
 * chat embed works. She sees the course, the learner's progress and the step
 * on screen, and helps them understand it without giving answers (the rules
 * live server-side, on the `smeepCourseHelp` agent).
 *
 * The chat (CopilotKit and its styles) loads on first open, and then stays
 * mounted, so closing the panel keeps the conversation.
 */
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMinWidth } from '@/lib/useNarrow'
import type { CourseSanaChatProps } from './CourseSanaChat'
import './course-sana.css'

/** Same image as SanaMessages' avatar, without loading the chat bundle. */
const SANA_AVATAR_SRC = '/images/redesign/anna-avatar-96.png'

const CourseSanaChat = dynamic(() => import('./CourseSanaChat'), {
  ssr: false,
  loading: () => <PanelLoading />,
})

function PanelLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-ui-muted" aria-busy="true">
      <span className="h-2 w-24 animate-pulse rounded-full bg-ui-surface-2" />
      Opening Anna…
    </div>
  )
}

const MODE_KEY = 'smeep.courseSana.mode'
/** Screens wide enough for Anna to sit beside the lesson as a drawer. */
const DOCK_MIN = 1280

export type SanaLayout = {
  /** The screen is wide enough and the page has room for a drawer. */
  canDock: boolean
  docked: boolean
  toggle: () => void
}

export function CourseSana({
  dockable = false,
  onDockedChange,
  ...props
}: Omit<CourseSanaChatProps, 'open' | 'onClose' | 'layout'> & {
  /** Render where a side drawer can take its place in the page's row. */
  dockable?: boolean
  /** Whether Anna is open as a drawer (the page makes room for her). */
  onDockedChange?: (docked: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Drawer by default on wide screens; the learner can float her instead,
  // and the choice is remembered on this device.
  const wide = useMinWidth(DOCK_MIN)
  const [mode, setMode] = useState<'drawer' | 'float'>('drawer')
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'float') setMode('float')
    } catch {
      /* storage blocked: keep the default */
    }
  }, [])
  const canDock = dockable && wide
  const docked = canDock && mode === 'drawer'
  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === 'drawer' ? 'float' : 'drawer'
      try {
        localStorage.setItem(MODE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  useEffect(() => onDockedChange?.(open && docked), [open, docked, onDockedChange])

  const show = useCallback(() => {
    setLoaded(true)
    setOpen(true)
  }, [])
  const close = useCallback(() => {
    setOpen(false)
    launcherRef.current?.focus({ preventScroll: true })
  }, [])

  // Esc closes from anywhere inside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelRef.current?.contains(document.activeElement)) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // A phone sheet shouldn't let the page scroll behind it.
  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 640px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={close}
          className="course-sana-scrim fixed inset-0 z-[45] bg-[rgba(16,10,28,0.42)] min-[641px]:hidden"
        />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Anna, your course guide"
        aria-modal={false}
        hidden={!open}
        className={cn(
          'course-sana-panel flex flex-col overflow-hidden bg-ui-surface text-ui-text',
          docked
            ? // Wide screens: a drawer in the page's row; the lesson narrows.
              'course-sana-docked relative w-[380px] shrink-0 border-s border-ui-line'
            : [
                'fixed z-[46]',
                // Phone: a bottom sheet under a scrim.
                'inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+max(44px,9vh))] rounded-t-[20px]',
                // Larger: a card above the launcher.
                'min-[641px]:inset-auto min-[641px]:right-5 min-[641px]:w-[380px] min-[641px]:rounded-[18px] min-[641px]:border min-[641px]:border-ui-line',
                'min-[641px]:bottom-[calc(52px+env(safe-area-inset-bottom)+16px+68px)] min-[641px]:h-[min(600px,calc(100dvh-52px-env(safe-area-inset-bottom)-16px-68px-24px))]',
                'lg:bottom-[88px] lg:h-[min(580px,calc(100dvh-112px))]',
              ],
        )}
      >
        {loaded && (
          <CourseSanaChat {...props} open={open} onClose={close} layout={{ canDock, docked, toggle: toggleMode }} />
        )}
      </div>

      <button
        ref={launcherRef}
        type="button"
        onClick={open ? close : show}
        aria-expanded={open}
        aria-label={open ? 'Close Anna' : 'Ask Anna about this course'}
        title={open ? undefined : 'Ask Anna about this course'}
        className={cn(
          'course-sana-launcher fixed right-4 z-[46] flex h-14 w-14 items-center justify-center rounded-full',
          'bottom-[calc(52px+env(safe-area-inset-bottom)+16px)] lg:bottom-5 lg:right-5',
          'transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 active:scale-[0.97]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
          open ? 'bg-ui-brand text-white hover:bg-ui-brand-hover max-[640px]:hidden' : 'bg-ui-surface p-[3px] ring-2 ring-ui-brand',
          // The drawer has its own close button and would sit under the launcher.
          open && docked && 'hidden',
        )}
      >
        {open ? (
          <ChevronDown className="h-6 w-6" strokeWidth={2} aria-hidden />
        ) : (
          <>
            <img src={SANA_AVATAR_SRC} alt="" className="h-full w-full rounded-full object-cover object-top" />
            <span aria-hidden className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-ui-surface bg-[#1f9d63]" />
          </>
        )}
      </button>
    </>
  )
}
