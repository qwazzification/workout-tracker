'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export interface ChartPoint {
  date: string
  maxWeight: number
  totalVolume: number
}

interface ExerciseChartProps {
  data: ChartPoint[]
  metric: 'maxWeight' | 'totalVolume'
}

export default function ExerciseChart({ data, metric }: ExerciseChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">
        No data yet for this exercise.
      </div>
    )
  }

  const label = metric === 'maxWeight' ? 'Max Weight (lbs)' : 'Total Volume (lbs)'

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Tooltip
          contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
          formatter={(v: number) => [`${v} lbs`, label]}
        />
        <Line
          type="monotone"
          dataKey={metric}
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 3, fill: '#2563eb' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
