'use client'

/**
 * Side-panel content for the questionnaire step of a journey (before a path
 * exists): how the questionnaire works, and what happens after the answers.
 */

const DEFAULT_BUILD_STEPS = [
  'Analyzing your profile and goals',
  'Mapping your skill gaps',
  'Curating the best content',
  'Building your milestones',
  'Personalizing your path',
]

export function DiscoveryHowItWorks({
  title = 'How it works',
  steps,
  current = 0,
}: {
  title?: string
  steps: { label: string; detail: string }[]
  /** The step the learner is on; earlier steps show as done. */
  current?: number
}) {
  return (
    <>
      <h2 className="px-2 text-[15px] font-semibold text-ui-text">{title}</h2>
      <ol className="flex flex-col gap-0.5">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={s.label} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 rounded-[10px] p-2" aria-current={active ? 'step' : undefined}>
              <span
                className={
                  active
                    ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-ui-brand text-[11px] font-bold text-white'
                    : done
                      ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-ui-brand-soft text-[11px] font-bold text-ui-brand-text'
                      : 'inline-flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-ui-line text-[11px] font-bold text-ui-muted'
                }
                aria-hidden
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={active ? 'text-[13px] font-semibold text-ui-text' : done ? 'text-[13px] text-ui-muted' : 'text-[13px] text-ui-text'}>{s.label}</span>
                <span className="text-xs text-ui-muted">{s.detail}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </>
  )
}

export function AfterAnswersNote({
  note = 'Building your path usually takes under 2 minutes.',
  steps = DEFAULT_BUILD_STEPS,
}: {
  note?: string
  steps?: string[]
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-ui-line p-3">
      <span className="text-[13px] font-semibold text-ui-text">After your answers</span>
      <span className="text-xs text-ui-muted">{note}</span>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-[13px] text-ui-muted">
            <span
              className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ui-line text-[10px] font-bold"
              aria-hidden
            >
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}
