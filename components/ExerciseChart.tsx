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
      <div className="flex items-center justify-center h-52 text-gray-400 text-sm">
        No data yet for this exercise.
      </div>
    )
  }

  const label = metric === 'maxWeight' ? 'Max Weight (lbs)' : 'Total Volume (lbs)'

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
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
