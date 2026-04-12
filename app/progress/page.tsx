'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import ExerciseChart, { ChartPoint } from '@/components/ExerciseChart'
import { format } from 'date-fns'

export default function Progress() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState<ChartPoint[]>([])
  const [metric, setMetric] = useState<'maxWeight' | 'totalVolume'>('maxWeight')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('exercises')
      .select('*')
      .order('name')
      .then(({ data }) => setExercises(data || []))
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setData([])
      return
    }
    setLoading(true)

    supabase
      .from('sets')
      .select('reps, weight, workout_logs(date)')
      .eq('exercise_id', selectedId)
      .not('weight', 'is', null)
      .then(({ data: sets }) => {
        if (!sets) {
          setData([])
          setLoading(false)
          return
        }

        // Aggregate per date: max weight and total volume
        const byDate: Record<string, { maxWeight: number; totalVolume: number }> = {}

        ;(sets as unknown as { reps: number | null; weight: number | null; workout_logs: { date: string } | null }[]).forEach((s) => {
          const date = s.workout_logs?.date
          if (!date || s.weight == null) return
          const w = s.weight
          const r = s.reps ?? 1
          if (!byDate[date]) byDate[date] = { maxWeight: 0, totalVolume: 0 }
          byDate[date].maxWeight = Math.max(byDate[date].maxWeight, w)
          byDate[date].totalVolume += w * r
        })

        const points: ChartPoint[] = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, vals]) => ({
            date: format(new Date(date + 'T00:00:00'), 'M/d'),
            maxWeight: Math.round(vals.maxWeight * 10) / 10,
            totalVolume: Math.round(vals.totalVolume),
          }))

        setData(points)
        setLoading(false)
      })
  }, [selectedId])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Progress</h1>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Exercise</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an exercise...</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          {(['maxWeight', 'totalVolume'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                metric === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m === 'maxWeight' ? 'Max Weight' : 'Total Volume'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center h-52 text-gray-400 text-sm">
            Loading...
          </div>
        ) : !selectedId ? (
          <div className="flex items-center justify-center h-52 text-gray-400 text-sm">
            Select an exercise above to view your progress.
          </div>
        ) : (
          <ExerciseChart data={data} metric={metric} />
        )}
      </div>

      {data.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl font-bold text-blue-600">
              {Math.max(...data.map((d) => d.maxWeight))} lbs
            </div>
            <div className="text-xs text-gray-500 mt-1">All-time max weight</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl font-bold text-blue-600">{data.length}</div>
            <div className="text-xs text-gray-500 mt-1">Sessions logged</div>
          </div>
        </div>
      )}
    </div>
  )
}
