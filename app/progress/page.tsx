'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import ExerciseChart, { ChartPoint } from '@/components/ExerciseChart'
import { format, subDays, startOfDay } from 'date-fns'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'

const RADAR_PRESETS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const

type RawSet = {
  weight: number | null
  reps: number | null
  exercise: { muscle_group: string | null } | null
  workout_log: { date: string } | null
}

export default function Statistics() {
  const today = format(startOfDay(new Date()), 'yyyy-MM-dd')

  const [allSets, setAllSets] = useState<RawSet[]>([])
  const [radarMetric, setRadarMetric] = useState<'sets' | 'volume'>('sets')
  const [radarPreset, setRadarPreset] = useState('3M')
  const [radarFrom, setRadarFrom] = useState(format(subDays(new Date(), 89), 'yyyy-MM-dd'))
  const [radarTo, setRadarTo] = useState(today)

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [metric, setMetric] = useState<'maxWeight' | 'totalVolume'>('maxWeight')
  const [lineLoading, setLineLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('sets')
      .select('weight, reps, exercise:exercises(muscle_group), workout_log:workout_logs(date)')
      .then(({ data }) => setAllSets((data as unknown as RawSet[]) || []))

    supabase
      .from('exercises')
      .select('*')
      .order('name')
      .then(({ data }) => setExercises(data || []))
  }, [])

  useEffect(() => {
    if (!selectedId) { setChartData([]); return }
    setLineLoading(true)
    supabase
      .from('sets')
      .select('reps, weight, workout_logs(date)')
      .eq('exercise_id', selectedId)
      .not('weight', 'is', null)
      .then(({ data: sets }) => {
        if (!sets) { setChartData([]); setLineLoading(false); return }
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
        setChartData(points)
        setLineLoading(false)
      })
  }, [selectedId])

  function applyRadarPreset(label: string, days: number) {
    setRadarPreset(label)
    setRadarTo(today)
    setRadarFrom(days === 0 ? '2000-01-01' : format(subDays(new Date(), days - 1), 'yyyy-MM-dd'))
  }

  const radarData = useMemo(() => {
    const byMuscle: Record<string, { sets: number; volume: number }> = {}
    allSets.forEach((s) => {
      const date = s.workout_log?.date
      if (!date) return
      if (radarPreset !== 'All' && (date < radarFrom || date > radarTo)) return
      const muscle = s.exercise?.muscle_group || 'Other'
      if (!byMuscle[muscle]) byMuscle[muscle] = { sets: 0, volume: 0 }
      byMuscle[muscle].sets++
      byMuscle[muscle].volume += (s.weight ?? 0) * (s.reps ?? 1)
    })
    return Object.entries(byMuscle)
      .map(([subject, vals]) => ({
        subject,
        value: radarMetric === 'sets' ? vals.sets : Math.round(vals.volume),
      }))
      .sort((a, b) => b.value - a.value)
  }, [allSets, radarFrom, radarTo, radarPreset, radarMetric])

  const inputClass = 'flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const btnInactive = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
  const btnActive = 'bg-blue-600 text-white'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Statistics</h1>

      {/* Muscle group radar chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Volume by Muscle Group</h2>

        <div className="flex gap-2 mb-3">
          {(['sets', 'volume'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setRadarMetric(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${radarMetric === m ? btnActive : btnInactive}`}
            >
              {m === 'sets' ? 'Sets' : 'Volume (lbs)'}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 mb-3">
          {RADAR_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyRadarPreset(p.label, p.days)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${radarPreset === p.label ? btnActive : btnInactive}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {radarPreset !== 'All' && (
          <div className="flex gap-2 items-center mb-4">
            <input type="date" value={radarFrom} max={radarTo}
              onChange={(e) => { setRadarFrom(e.target.value); setRadarPreset('') }}
              className={inputClass}
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">to</span>
            <input type="date" value={radarTo} min={radarFrom} max={today}
              onChange={(e) => { setRadarTo(e.target.value); setRadarPreset('') }}
              className={inputClass}
            />
          </div>
        )}

        {radarData.length === 0 ? (
          <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">
            No workout data in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <PolarRadiusAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} tickCount={4} />
              <Radar dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} strokeWidth={2} />
              <Tooltip
                contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
                formatter={(v: number) => [
                  radarMetric === 'sets' ? `${v} sets` : `${v.toLocaleString()} lbs`,
                  radarMetric === 'sets' ? 'Sets' : 'Volume',
                ]}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-exercise progress chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Exercise Progress</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Exercise</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an exercise...</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          {(['maxWeight', 'totalVolume'] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${metric === m ? btnActive : btnInactive}`}
            >
              {m === 'maxWeight' ? 'Max Weight' : 'Total Volume'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        {lineLoading ? (
          <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
        ) : !selectedId ? (
          <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">
            Select an exercise above to view your progress.
          </div>
        ) : (
          <ExerciseChart data={chartData} metric={metric} />
        )}
      </div>

      {chartData.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-2xl font-bold text-blue-600">
              {Math.max(...chartData.map((d) => d.maxWeight))} lbs
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">All-time max weight</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-2xl font-bold text-blue-600">{chartData.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sessions logged</div>
          </div>
        </div>
      )}
    </div>
  )
}
