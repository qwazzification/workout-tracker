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
  const [expanded, setExpanded] = useState<string | null>(null)
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

  async function deleteWorkout(id: string) {
    if (!confirm('Delete this workout? This cannot be undone.')) return
    await supabase.from('workout_logs').delete().eq('id', id)
    setWorkouts((prev) => prev.filter((w) => w.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const activityData = workouts.map((w) => ({
    date: w.date,
    routineName: w.routine?.name ?? null,
  }))

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">History</h1>

      <WorkoutActivity workouts={activityData} onFilterChange={setDateFilter} />

      {/* Routine filter */}
      {routineOptions.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <select
            value={routineFilter}
            onChange={(e) => setRoutineFilter(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All routines</option>
            {routineOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {routineFilter && (
            <button
              onClick={() => setRoutineFilter('')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
            >
              Clear ×
            </button>
          )}
        </div>
      )}

      {displayedWorkouts.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          {workouts.length === 0 ? 'No workouts logged yet.' : 'No workouts match the current filters.'}
        </div>
      ) : (
        <div className="space-y-3">
          {displayedWorkouts.map((w) => {
            const isOpen = expanded === w.id

            const byExercise = w.sets.reduce<Record<string, SetRow[]>>((acc, s) => {
              const name = s.exercise?.name ?? 'Unknown'
              if (!acc[name]) acc[name] = []
              acc[name].push(s)
              return acc
            }, {})

            // Map exercise name -> notes for display
            const exNotesByName: Record<string, string> = {}
            w.workout_exercise_notes?.forEach((n) => {
              const name = n.exercise?.name ?? 'Unknown'
              exNotesByName[name] = n.notes
            })

            const exerciseCount = Object.keys(byExercise).length

            return (
              <div
                key={w.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : w.id)}
                  className="w-full text-left p-4 flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold text-gray-900">
                      {w.routine?.name ?? 'Workout'}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {format(new Date(w.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                      {' · '}
                      {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className="text-gray-400 ml-2">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                    {w.notes && (
                      <p className="text-sm text-gray-500 italic mb-4">
                        {`"${w.notes}"`}
                      </p>
                    )}

                    <div className="space-y-4">
                      {Object.entries(byExercise).map(([name, sets]) => (
                        <div key={name}>
                          <div className="text-sm font-semibold text-gray-800 mb-1">{name}</div>
                          {exNotesByName[name] && (
                            <p className="text-xs text-gray-400 italic mb-2">
                              {exNotesByName[name]}
                            </p>
                          )}
                          <div className="grid grid-cols-3 text-xs text-gray-400 font-medium mb-1 px-1">
                            <span>Set</span>
                            <span>Reps</span>
                            <span>Weight</span>
                          </div>
                          {sets
                            .sort((a, b) => a.set_number - b.set_number)
                            .map((s) => (
                              <div
                                key={s.id}
                                className="grid grid-cols-3 text-sm text-gray-700 px-1 py-0.5"
                              >
                                <span>{s.set_number}</span>
                                <span>{s.reps ?? '—'}</span>
                                <span>{s.weight != null ? `${s.weight} lbs` : '—'}</span>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4 mt-5">
                      <Link href={`/log/${w.id}`} className="text-sm text-blue-600 hover:underline">
                        Edit workout
                      </Link>
                      <button
                        onClick={() => deleteWorkout(w.id)}
                        className="text-sm text-red-400 hover:text-red-600"
                      >
                        Delete workout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
