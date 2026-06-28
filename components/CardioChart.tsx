'use client'

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export interface CardioPoint {
  date: string
  paceSeconds: number  // seconds per mile — lower is faster
  distance: number     // miles
}

export function fmtPace(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function CardioChart({ data }: { data: CardioPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">
        No data yet for this exercise.
      </div>
    )
  }

  return (
    <>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-brand-500 rounded" />
          <span>Pace (min/mi) — lower is faster</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-400 dark:bg-gray-500 opacity-60" />
          <span>Distance (mi)</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          {/* Reversed so faster pace (lower seconds) appears higher on the chart */}
          <YAxis
            yAxisId="pace"
            orientation="left"
            reversed
            width={44}
            tickFormatter={fmtPace}
            tick={{ fontSize: 10, fill: '#ff6e35' }}
          />
          <YAxis
            yAxisId="distance"
            orientation="right"
            width={44}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v: number) => `${v}mi`}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
            formatter={(value: number, name: string) => {
              if (name === 'paceSeconds') return [`${fmtPace(value)} /mi`, 'Best Pace']
              return [`${value} mi`, 'Distance']
            }}
          />
          <Bar
            yAxisId="distance"
            dataKey="distance"
            fill="#6b7280"
            opacity={0.5}
            radius={[2, 2, 0, 0]}
            name="distance"
          />
          <Line
            yAxisId="pace"
            type="monotone"
            dataKey="paceSeconds"
            stroke="#ff6e35"
            strokeWidth={2}
            dot={{ r: 3, fill: '#ff6e35' }}
            activeDot={{ r: 5 }}
            name="paceSeconds"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}
