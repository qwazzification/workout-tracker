'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format, startOfWeek } from 'date-fns'

interface SetRow {
  id: string
  set_number: number
  reps: number | null
  weight: number | null
  exercise: { id: string; name: string } | null
}

interface LastWorkout {
  id: string
  date: string
  notes: string | null
  routine: { name: string } | null
  sets: SetRow[]
}

export default function FeedPage() {
  const [lastWorkout, setLastWorkout] = useState<LastWorkout | null>(null)
  const [weekCount, setWeekCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd')

      const [{ data: recent }, { count }] = await Promise.all([
        supabase
          .from('workout_logs')
          .select('id, date, notes, routine:routines(name), sets(id, set_number, reps, weight, exercise:exercises(id, name))')
          .order('date', { ascending: false })
          .limit(1),
        supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .gte('date', weekStart),
      ])

      const rows = (recent as unknown as LastWorkout[]) || []
      setLastWorkout(rows[0] ?? null)
      setWeekCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  // Group sets by exercise, preserving insertion order
  const exerciseGroups = useMemo(() => {
    if (!lastWorkout) return []
    const order: string[] = []
    const groups = new Map<string, { id: string; name: string; sets: SetRow[] }>()
    lastWorkout.sets.forEach((s) => {
      const id = s.exercise?.id ?? 'unknown'
      const name = s.exercise?.name ?? 'Unknown'
      if (!groups.has(id)) {
        order.push(id)
        groups.set(id, { id, name, sets: [] })
      }
      groups.get(id)!.sets.push(s)
    })
    return order.map((id) => groups.get(id)!)
  }, [lastWorkout])

  const totalVolume = useMemo(() => {
    if (!lastWorkout) return 0
    return lastWorkout.sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
  }, [lastWorkout])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Feed</h1>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-4xl font-bold text-brand-500">{weekCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Workouts this week</div>
        </div>
        <Link
          href="/workout"
          className="bg-brand-700 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-white hover:bg-brand-600 transition-colors"
        >
          <span className="text-3xl">💪</span>
          <span className="text-sm font-semibold mt-1">Start Workout</span>
        </Link>
      </div>

      <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3">Last Workout</h2>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      ) : !lastWorkout ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-100 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 mb-3">No workouts logged yet.</p>
          <Link href="/workout" className="text-brand-600 text-sm font-medium hover:underline">
            Start your first workout →
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Workout header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {lastWorkout.routine?.name ?? 'Workout'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {format(new Date(lastWorkout.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
              </div>
            </div>
            <Link
              href={`/workouts/${lastWorkout.id}`}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium shrink-0 ml-3"
            >
              View →
            </Link>
          </div>

          {/* Notes */}
          {lastWorkout.notes && (
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 italic">
              {lastWorkout.notes}
            </div>
          )}

          {/* Exercises */}
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {exerciseGroups.map((group) => (
              <div key={group.id} className="p-4">
                <Link
                  href={`/exercises/${group.id}`}
                  className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  {group.name}
                </Link>
                <div className="mt-2 space-y-1">
                  {group.sets
                    .slice()
                    .sort((a, b) => a.set_number - b.set_number)
                    .map((s) => (
                      <div key={s.id} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-10 shrink-0">
                          Set {s.set_number}
                        </span>
                        <span>
                          {s.reps != null ? `${s.reps} reps` : '—'}
                          {s.weight != null ? ` × ${s.weight} lbs` : ''}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer stats */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{exerciseGroups.length} exercise{exerciseGroups.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{lastWorkout.sets.length} set{lastWorkout.sets.length !== 1 ? 's' : ''}</span>
            {totalVolume > 0 && (
              <>
                <span>·</span>
                <span>{totalVolume.toLocaleString()} lbs volume</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
