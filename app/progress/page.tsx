'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format, subDays, startOfDay } from 'date-fns'
import type { User } from '@supabase/supabase-js'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import WorkoutActivity from '@/components/WorkoutActivity'

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
  exercise: { id: string; name: string; muscle_group: string | null } | null
  workout_log: { date: string } | null
}

type CalendarWorkout = { date: string; routineName: string | null; workoutId: string }

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return v.toString()
}

export default function ProfilePage() {
  const today = format(startOfDay(new Date()), 'yyyy-MM-dd')

  const [user, setUser] = useState<User | null>(null)
  const [allSets, setAllSets] = useState<RawSet[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [calendarWorkouts, setCalendarWorkouts] = useState<CalendarWorkout[]>([])

  const [radarMetric, setRadarMetric] = useState<'sets' | 'volume'>('sets')
  const [radarPreset, setRadarPreset] = useState('3M')
  const [radarFrom, setRadarFrom] = useState(format(subDays(new Date(), 89), 'yyyy-MM-dd'))
  const [radarTo, setRadarTo] = useState(today)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))

    // Workout list for calendar — also drives totalWorkouts count
    supabase
      .from('workout_logs')
      .select('id, date, routine:routines(name)')
      .order('date', { ascending: false })
      .then(({ data }) => {
        setTotalWorkouts(data?.length ?? 0)
        setCalendarWorkouts(
          ((data ?? []) as unknown as { id: string; date: string; routine: { name: string } | null }[]).map((w) => ({
            date: w.date,
            workoutId: w.id,
            routineName: w.routine?.name ?? null,
          }))
        )
      })

    // Sets — used for radar chart, volume stats, and day-exercise details
    supabase
      .from('sets')
      .select('weight, reps, exercise:exercises(id, name, muscle_group), workout_log:workout_logs(date)')
      .then(({ data }) => setAllSets((data as unknown as RawSet[]) || []))
  }, [])

  function applyRadarPreset(label: string, days: number) {
    setRadarPreset(label)
    setRadarTo(today)
    setRadarFrom(days === 0 ? '2000-01-01' : format(subDays(new Date(), days - 1), 'yyyy-MM-dd'))
  }

  const radarData = useMemo(() => {
    // All-time muscle groups → defines axis positions (never changes with filter)
    const allMuscles = new Set<string>()
    allSets.forEach((s) => {
      const muscle = s.exercise?.muscle_group || 'Other'
      if (muscle.toLowerCase() !== 'cardio') allMuscles.add(muscle)
    })

    // Filtered values for the selected date range
    const byMuscle: Record<string, { sets: number; volume: number }> = {}
    allSets.forEach((s) => {
      const date = s.workout_log?.date
      if (!date) return
      if (radarPreset !== 'All' && (date < radarFrom || date > radarTo)) return
      const muscle = s.exercise?.muscle_group || 'Other'
      if (muscle.toLowerCase() === 'cardio') return
      if (!byMuscle[muscle]) byMuscle[muscle] = { sets: 0, volume: 0 }
      byMuscle[muscle].sets++
      byMuscle[muscle].volume += (s.weight ?? 0) * (s.reps ?? 1)
    })

    // Stable alphabetical order across all user's muscles; value is 0 when outside range
    return Array.from(allMuscles)
      .sort((a, b) => a.localeCompare(b))
      .map((muscle) => ({
        subject: muscle,
        value: byMuscle[muscle]
          ? radarMetric === 'sets'
            ? byMuscle[muscle].sets
            : Math.round(byMuscle[muscle].volume)
          : 0,
      }))
  }, [allSets, radarFrom, radarTo, radarPreset, radarMetric])

  /** Per-date map of unique exercises — passed to the calendar for clickable exercise pills */
  const dayExercises = useMemo(() => {
    const byDate: Record<string, Map<string, { id: string; name: string }>> = {}
    allSets.forEach((s) => {
      const date = s.workout_log?.date
      const ex = s.exercise
      if (!date || !ex?.id) return
      if (!byDate[date]) byDate[date] = new Map()
      byDate[date].set(ex.id, { id: ex.id, name: ex.name })
    })
    const result: Record<string, Array<{ id: string; name: string }>> = {}
    Object.entries(byDate).forEach(([date, map]) => {
      result[date] = Array.from(map.values())
    })
    return result
  }, [allSets])

  const totalVolume = allSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 1), 0)
  const totalSetCount = allSets.length

  const btnInactive = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
  const btnActive = 'bg-brand-600 text-white'
  const inputClass = 'flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'

  const meta = user?.user_metadata ?? {}
  const displayName = (meta.display_name as string | undefined) || user?.email?.split('@')[0] || ''
  const initial = displayName[0]?.toUpperCase() ?? '?'
  const memberSince = user?.created_at ? format(new Date(user.created_at), 'MMM yyyy') : null

  return (
    <div>
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-brand-600 dark:text-brand-400">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{displayName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          {memberSince && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Member since {memberSince}</p>
          )}
        </div>
        <Link
          href="/account"
          className="shrink-0 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Account settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      {/* All-time summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="text-2xl font-bold text-brand-600">{totalWorkouts}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Workouts</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="text-2xl font-bold text-brand-600">{totalSetCount.toLocaleString()}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sets logged</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="text-2xl font-bold text-brand-600">{formatVolume(totalVolume)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Volume (lbs)</div>
        </div>
      </div>

      {/* Activity calendar — above radar */}
      <WorkoutActivity
        workouts={calendarWorkouts}
        dayDetails={dayExercises}
      />

      {/* Muscle volume radar */}
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
            No workout data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <PolarRadiusAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} tickCount={4} />
              <Radar dataKey="value" stroke="#ff6e35" fill="#ff6e35" fillOpacity={0.25} strokeWidth={2} />
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

      {/* Quick-access cards */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1">Explore</p>

        <Link
          href="/exercises"
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-4 flex items-center justify-between hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
        >
          <div>
            <div className="font-semibold text-gray-900 dark:text-white text-sm">Exercise Library &amp; Progress</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Browse exercises, view charts and PRs</div>
          </div>
          <span className="text-gray-300 dark:text-gray-600 text-lg ml-3 shrink-0">›</span>
        </Link>

        <Link
          href="/history"
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-4 flex items-center justify-between hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
        >
          <div>
            <div className="font-semibold text-gray-900 dark:text-white text-sm">Workout History</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">All past sessions with full details</div>
          </div>
          <span className="text-gray-300 dark:text-gray-600 text-lg ml-3 shrink-0">›</span>
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-4 flex items-center justify-between opacity-50">
          <div>
            <div className="font-semibold text-gray-900 dark:text-white text-sm">Routine Statistics</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Coming soon</div>
          </div>
          <span className="text-gray-300 dark:text-gray-600 text-lg ml-3 shrink-0">›</span>
        </div>
      </div>
    </div>
  )
}
