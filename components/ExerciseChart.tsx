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

export interface ChartPoint {
  date: string
  maxWeight: number
  totalVolume: number
}

export default function ExerciseChart({ data }: { data: ChartPoint[] }) {
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
          <span>Max weight (lbs)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-400 dark:bg-gray-500 opacity-60" />
          <span>Total volume (lbs)</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis
            yAxisId="weight"
            orientation="left"
            width={44}
            tick={{ fontSize: 11, fill: '#ff6e35' }}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            width={44}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
            formatter={(value: number, name: string) => {
              if (name === 'maxWeight') return [`${value} lbs`, 'Max Weight']
              return [`${value.toLocaleString()} lbs`, 'Total Volume']
            }}
          />
          <Bar
            yAxisId="volume"
            dataKey="totalVolume"
            fill="#6b7280"
            opacity={0.5}
            radius={[2, 2, 0, 0]}
            name="totalVolume"
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="maxWeight"
            stroke="#ff6e35"
            strokeWidth={2}
            dot={{ r: 3, fill: '#ff6e35' }}
            activeDot={{ r: 5 }}
            name="maxWeight"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}
