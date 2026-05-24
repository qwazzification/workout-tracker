'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import WorkoutActivity, { FilterRange } from '@/components/WorkoutActivity'

interface SetRow {
  id: string
  set_number: number
  reps: number | null
  weight: number | null
  exercise: { name: string } | null
}

interface ExerciseNote {
  exercise_id: string
  notes: string
  exercise: { name: string } | null
}

interface WorkoutEntry {
  id: string
  date: string
  notes: string | null
  routine: { name: string } | null
  sets: SetRow[]
  workout_exercise_notes: ExerciseNote[]
}

export default function History() {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<FilterRange | null>(null)
  const [routineFilter, setRoutineFilter] = useState('')

  useEffect(() => {
    supabase
      .from('workout_logs')
      .select(`
        id, date, notes,
        routine:routines(name),
        sets(id, set_number, reps, weight, exercise:exercises(name)),
        workout_exercise_notes(exercise_id, notes, exercise:exercises(name))
      `)
      .order('date', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setWorkouts((data as unknown as WorkoutEntry[]) || [])
        setLoading(false)
      })
  }, [])

  const routineOptions = useMemo(() => {
    const seen = new Set<string>()
    workouts.forEach((w) => { if (w.routine?.name) seen.add(w.routine.name) })
    return Array.from(seen).sort()
  }, [workouts])

  const displayedWorkouts = useMemo(() => {
    return workouts.filter((w) => {
      if (dateFilter && (w.date < dateFilter.from || w.date > dateFilter.to)) return false
      if (routineFilter && w.routine?.name !== routineFilter) return false
      return true
    })
  }, [workouts, dateFilter, routineFilter])

  const activityData = workouts.map((w) => ({
    date: w.date,
    routineName: w.routine?.name ?? null,
    workoutId: w.id,
  }))

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Activity</h1>

      <WorkoutActivity workouts={activityData} onFilterChange={setDateFilter} />

      {routineOptions.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <select
            value={routineFilter}
            onChange={(e) => setRoutineFilter(e.target.value)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All routines</option>
            {routineOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {routineFilter && (
            <button
              onClick={() => setRoutineFilter('')}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium whitespace-nowrap"
            >
              Clear ×
            </button>
          )}
        </div>
      )}

      {displayedWorkouts.length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-16">
          {workouts.length === 0 ? 'No workouts logged yet.' : 'No workouts match the current filters.'}
        </div>
      ) : (
        <div className="space-y-3">
          {displayedWorkouts.map((w) => {
            const exerciseCount = new Set(w.sets.map((s) => s.exercise?.name)).size

            return (
              <Link
                key={w.id}
                href={`/workouts/${w.id}`}
                className="block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {w.routine?.name ?? 'Workout'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {format(new Date(w.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                      {' · '}
                      {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className="text-gray-300 dark:text-gray-600 ml-2">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
