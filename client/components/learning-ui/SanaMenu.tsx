'use client'

/**
 * A small menu button for the Anna page headers (course picker, language
 * picker). A real <button> that opens a list of options; closes on outside
 * click and Escape, arrow keys move between options, and focus returns to
 * the trigger.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'

export interface SanaMenuItem {
  key: string
  label: ReactNode
  hint?: ReactNode
  selected?: boolean
  disabled?: boolean
  lang?: string
  dir?: 'ltr' | 'rtl'
  onSelect: () => void
}

export function SanaMenu({
  label,
  icon,
  items,
  ariaLabel,
  className,
  menuClassName,
  align = 'end',
  disabled,
  footer,
}: {
  label: ReactNode
  icon?: ReactNode
  items: SanaMenuItem[]
  ariaLabel?: string
  className?: string
  menuClassName?: string
  align?: 'start' | 'end'
  disabled?: boolean
  /** Extra items under a divider (same shape). */
  footer?: SanaMenuItem[]
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Focus the selected (or first) option.
    const opts = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"],[role="menuitem"]')
    const selected = listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    ;(selected ?? opts?.[0])?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const opts = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled),[role="menuitem"]:not(:disabled)') ?? [],
    )
    if (!opts.length) return
    const i = opts.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? opts.length - 1 : e.key === 'ArrowDown' ? (i + 1) % opts.length : (i - 1 + opts.length) % opts.length
    opts[next]?.focus()
  }

  const renderItem = (item: SanaMenuItem, radio: boolean) => (
    <button
      key={item.key}
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? Boolean(item.selected) : undefined}
      disabled={item.disabled}
      lang={item.lang}
      dir={item.dir}
      onClick={() => {
        close()
        item.onSelect()
      }}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-ui-text transition-colors hover:bg-ui-surface-2 focus:bg-ui-surface-2 focus:outline-none disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate', item.selected && 'font-semibold')}>{item.label}</span>
        {item.hint && <span className="text-xs text-ui-muted">{item.hint}</span>}
      </span>
      {radio && item.selected && <Check className="h-4 w-4 flex-none text-ui-brand-text" aria-hidden />}
    </button>
  )

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 max-w-full px-3.5')}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className={cn('h-4 w-4 flex-none text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          onKeyDown={onListKey}
          className={cn(
            'absolute top-[calc(100%+6px)] z-40 max-h-[60vh] min-w-[220px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[12px] border border-ui-line bg-ui-surface p-1.5 shadow-ui',
            align === 'end' ? 'end-0' : 'start-0',
            menuClassName,
          )}
        >
          {items.map((item) => renderItem(item, true))}
          {footer && footer.length > 0 && (
            <>
              <div className="my-1.5 h-px bg-ui-line" role="separator" />
              {footer.map((item) => renderItem(item, false))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
