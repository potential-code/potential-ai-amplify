'use client'

/**
 * Small animated progress ring (adapted from FYA's ProgressRing). Drawn with
 * `pathLength` so the sweep is a single 0→1 animation at any size.
 */

import { motion } from 'framer-motion'

export function ProgressRing({
  percent,
  size = 34,
  label,
}: {
  /** 0–100. */
  percent: number
  size?: number
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const stroke = Math.max(3, size / 10)
  const radius = (size - stroke) / 2

  return (
    <div className="relative flex-none" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ui-surface-2, #F1F1F4)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ui-brand, #652d90)"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: clamped / 100 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-semibold text-ui-brand-text"
        style={{ fontSize: Math.max(8, Math.round(size * 0.26)) }}
      >
        {clamped}%
      </span>
      {label && <span className="sr-only">{`${label}: ${clamped}%`}</span>}
    </div>
  )
}
