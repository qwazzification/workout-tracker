'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'

export interface MuscleSetEntry {
  muscle: string
  date: string   // yyyy-MM-dd
  volume: number // weight * reps for the set
}

// Stable, distinct colors assigned per-muscle (alphabetical order)
const COLORS = [
  '#ff6e35', '#3b82f6', '#22c55e', '#a855f7', '#eab308',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444',
  '#0ea5e9', '#84cc16',
]

export default function MuscleProgressChart({
  data,
  metric,
}: {
  data: MuscleSetEntry[]
  metric: 'sets' | 'volume'
}) {
  // Distinct non-cardio muscles, stable alphabetical order
  const muscles = Array.from(
    new Set(data.filter((d) => d.muscle.toLowerCase() !== 'cardio').map((d) => d.muscle))
  ).sort((a, b) => a.localeCompare(b))

  // Bucket by calendar month → { muscle: total }
  const byMonth: Record<string, Record<string, number>> = {}
  data.forEach((d) => {
    if (d.muscle.toLowerCase() === 'cardio') return
    const month = d.date.slice(0, 7) // yyyy-MM
    if (!byMonth[month]) byMonth[month] = {}
    byMonth[month][d.muscle] = (byMonth[month][d.muscle] ?? 0) + (metric === 'sets' ? 1 : d.volume)
  })

  const chartData = Object.keys(byMonth)
    .sort()
    .map((month) => {
      const row: Record<string, number | string> = {
        month: format(new Date(month + '-01T00:00:00'), 'MMM yy'),
      }
      muscles.forEach((m) => { row[m] = Math.round(byMonth[month][m] ?? 0) })
      return row
    })

  if (chartData.length === 0 || muscles.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">
        Not enough data yet to show trends.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
          formatter={(v: number, name: string) => [
            metric === 'sets' ? `${v} sets` : `${v.toLocaleString()} lbs`,
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {muscles.map((m, i) => (
          <Line
            key={m}
            type="monotone"
            dataKey={m}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
