'use client'

import { HEATMAP_DAYS, HEATMAP_HOURS, HEATMAP_DATA } from '@/lib/adminData'

/** Activity heatmap (day x hour). Cell tint is the brand token mixed by value 0..100. */
function background(value: number) {
  const pct = Math.round(8 + (Math.max(0, Math.min(100, value)) / 100) * 85)
  return `color-mix(in srgb, var(--ui-brand) ${pct}%, var(--ui-surface-2))`
}

export function Heatmap() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-1">
        <caption className="sr-only">Activity by day and time</caption>
        <thead>
          <tr>
            <th className="w-12" />
            {HEATMAP_HOURS.map((h) => (
              <th key={h} scope="col" className="px-2 pb-2 text-xs font-medium text-ui-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HEATMAP_DATA.map((row, ri) => (
            <tr key={HEATMAP_DAYS[ri]}>
              <th scope="row" className="pr-2 text-right text-xs font-medium text-ui-muted">
                {HEATMAP_DAYS[ri]}
              </th>
              {row.map((v, ci) => (
                <td key={ci}>
                  <div
                    className="flex h-9 w-full items-center justify-center rounded-md text-[11px] font-semibold tabular-nums"
                    style={{ background: background(v), color: v > 55 ? '#fff' : 'var(--ui-text)' }}
                    title={`${HEATMAP_DAYS[ri]} ${HEATMAP_HOURS[ci]}: ${v}`}
                  >
                    {v}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
