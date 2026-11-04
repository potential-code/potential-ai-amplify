'use client'

/**
 * Anna's welcome block: her portrait, name, a one-line tagline and starter
 * chips. Used on the discovery screens and as the pre-conversation empty
 * state of the canvas. Redesign: a plain portrait with a quiet ring (no glow,
 * no float), plain type, chips in the shared chip style.
 */

import type { ReactNode } from 'react'
import { SANA_AVATAR_SRC } from './SanaMessages'

export function SanaOrb({ size = 88 }: { size?: number }) {
  return (
    <div className="relative mb-4 flex-none" style={{ width: size, height: size }}>
      <img
        src={SANA_AVATAR_SRC}
        alt="Anna"
        className="rounded-full object-cover object-top"
        style={{
          width: size,
          height: size,
          boxShadow: '0 0 0 4px var(--ui-surface), 0 0 0 5px var(--ui-line)',
        }}
      />
      <span
        aria-hidden
        className="absolute rounded-full bg-ui-ok"
        style={{
          bottom: size * 0.04,
          insetInlineEnd: size * 0.04,
          width: 14,
          height: 14,
          border: '2.5px solid var(--ui-surface)',
        }}
      />
    </div>
  )
}

export function SanaHero({
  title = "Hi, I'm Anna",
  tagline,
  subtitle,
  chips,
  onChip,
  children,
}: {
  title?: string
  tagline?: string
  subtitle?: ReactNode
  chips?: string[]
  onChip?: (chip: string) => void
  children?: ReactNode
}) {
  return (
    <div className="relative z-[1] flex flex-col items-center text-center px-6 pt-12 pb-8">
      <SanaOrb />
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text">{title}</h2>
      {tagline && <p className="mt-1 text-[15px] font-semibold text-ui-brand-text">{tagline}</p>}
      {subtitle && <div className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ui-muted">{subtitle}</div>}
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-6 max-w-[560px]">
          {chips.map((chip, i) => (
            <button key={i} type="button" className="sana-chip" onClick={() => onChip?.(chip)}>
              {chip}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

/** Retired backdrop (no glows in the redesign). Kept so callers need no change. */
export function SanaAmbient() {
  return null
}
