'use client'

/**
 * AI insights tab. Not wired into the Analytics page yet: the data below is
 * mock data from `lib/adminData`. Restyled to the redesign tokens so it is
 * ready to switch on once a real API exists.
 */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { useResolvedColors } from '@/components/admin/analytics/charts'
import {
  AI_CONVERSATIONS_OVER_TIME,
  AI_TOP_INTENTS,
  AI_SATISFACTION_TREND,
  AI_ACTIVE_USERS_PER_DAY,
} from '@/lib/adminData'

export function AnalyticsAiTab() {
  const c = useResolvedColors({ brand: chartColors.brand, muted: chartColors.muted, line: chartColors.line, surface2: chartColors.surface2 })
  const axis = { tick: { fill: c.muted, fontSize: 11 }, tickLine: false, axisLine: false } as const
  const tooltip = { ...chartTooltipStyle, cursor: { fill: c.surface2 } }

  return (
    <section aria-labelledby="h-ai" className="flex flex-col gap-4">
      <h2 id="h-ai" className="text-lg font-semibold text-ui-text">Assistant insights</h2>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AdminChartCard title="AI conversations over time" subtitle="Weekly chatbot conversations">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={AI_CONVERSATIONS_OVER_TIME} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltip} cursor={{ stroke: c.line }} />
                <Line type="monotone" dataKey="value" stroke={c.brand} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>

        <AdminChartCard title="Top user intents" subtitle="What members ask the AI">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={AI_TOP_INTENTS} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke={c.line} strokeDasharray="4 4" horizontal={false} />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="label" {...axis} width={110} />
                <Tooltip {...tooltip} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="value" fill={c.brand} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>

        <AdminChartCard title="AI satisfaction" subtitle="Weekly CSAT score">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={AI_SATISFACTION_TREND} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} domain={[60, 100]} />
                <Tooltip {...tooltip} cursor={{ stroke: c.line }} formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="value" stroke={c.brand} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>

        <AdminChartCard title="Active chatbot users per day" subtitle="Unique members who chatted with the AI">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={AI_ACTIVE_USERS_PER_DAY} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltip} />
                <Bar dataKey="value" fill={c.brand} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>
    </section>
  )
}
