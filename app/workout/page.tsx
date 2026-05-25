'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Routine, Exercise, RoutineExercise } from '@/lib/types'
import WorkoutSheet from '@/components/WorkoutSheet'
import { format } from 'date-fns'

type RoutineExerciseRow = RoutineExercise & { exercise: Exercise }

const cardClass = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700'

export default function WorkoutPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineExercises, setRoutineExercises] = useState<Record<string, RoutineExerciseRow[]>>({})
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)

  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [
        { data: { user } },
        { data: r },
        { data: e },
        { data: re },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('routines').select('*').order('name'),
        supabase.from('exercises').select('*').order('name'),
        supabase.from('routine_exercises').select('*, exercise:exercises(*)').order('sort_order'),
      ])

      setUserId(user?.id ?? '')
      setRoutines(r || [])
      setExercises(e || [])

      const grouped: Record<string, RoutineExerciseRow[]> = {}
      ;((re || []) as unknown as RoutineExerciseRow[]).forEach((item) => {
        if (!grouped[item.routine_id]) grouped[item.routine_id] = []
        grouped[item.routine_id].push(item)
      })
      setRoutineExercises(grouped)

      const savedId = localStorage.getItem('activeWorkoutId')
      if (savedId) {
        const { data: check } = await supabase
          .from('workout_logs').select('id').eq('id', savedId).maybeSingle()
        if (check) {
          setActiveWorkoutId(savedId)
        } else {
          localStorage.removeItem('activeWorkoutId')
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  async function startWorkout(routineId?: string) {
    if (activeWorkoutId) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const routineName = routineId ? (routines.find((r) => r.id === routineId)?.name ?? null) : null
    const { data } = await supabase
      .from('workout_logs')
      .insert({ date: today, name: routineName, routine_id: routineId ?? null, user_id: userId })
      .select().single()
    if (!data) return
    localStorage.setItem('activeWorkoutId', data.id)
    setActiveWorkoutId(data.id)
    setSheetOpen(true)
  }

  function onWorkoutFinished() {
    const id = activeWorkoutId
    localStorage.removeItem('activeWorkoutId')
    setActiveWorkoutId(null)
    setSheetOpen(false)
    if (id) router.push('/workouts/' + id)
  }

  async function onWorkoutDiscarded() {
    if (!activeWorkoutId) return
    await supabase.from('workout_logs').delete().eq('id', activeWorkoutId)
    localStorage.removeItem('activeWorkoutId')
    setActiveWorkoutId(null)
    setSheetOpen(false)
  }

  async function deleteRoutine(id: string) {
    if (!confirm('Delete this routine? Workouts using it will keep their data.')) return
    await supabase.from('routines').delete().eq('id', id)
    setRoutines((prev) => prev.filter((r) => r.id !== id))
    if (expanded === id) setExpanded(null)
  }

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Workout</h1>

      {/* Resume banner */}
      {activeWorkoutId && !sheetOpen && (
        <div className="bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-800 rounded-xl p-4 mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-brand-900 dark:text-brand-200 text-sm">Workout in progress</div>
            <div className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">Your sets are saved — tap to continue</div>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="shrink-0 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700"
          >
            Resume
          </button>
        </div>
      )}

      {/* Start blank workout */}
      <button
        onClick={() => startWorkout()}
        disabled={!!activeWorkoutId}
        className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Start blank workout
      </button>

      {/* Routines list */}
      {routines.length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
          No routines yet. Create one below.
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map((routine) => {
            const isOpen = expanded === routine.id
            const rExercises = routineExercises[routine.id] || []
            const preview = rExercises.slice(0, 3).map((re) => re.exercise.name).join(', ')

            return (
              <div key={routine.id} className={`${cardClass} overflow-hidden`}>
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/routines/${routine.id}`}
                      className="font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      {routine.name}
                    </Link>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                      {rExercises.length === 0
                        ? 'No exercises'
                        : `${preview}${rExercises.length > 3 ? ` +${rExercises.length - 3} more` : ''}`}
                    </div>
                  </div>
                  <button
                    onClick={() => setExpanded(isOpen ? null : routine.id)}
                    className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-1 rounded transition-colors"
                    title={isOpen ? 'Collapse' : 'Expand'}
                  >
                    <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  <button
                    onClick={() => startWorkout(routine.id)}
                    disabled={!!activeWorkoutId}
                    className="shrink-0 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Start
                  </button>
                </div>

                {/* Expanded: read-only exercise info */}
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3">
                    {rExercises.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                        No exercises yet.{' '}
                        <Link href={`/routines/${routine.id}`} className="text-brand-600 hover:underline">
                          Edit routine →
                        </Link>
                      </p>
                    ) : (
                      <div className="mb-3">
                        <div className="grid grid-cols-[1fr_3rem_3rem] text-xs text-gray-400 dark:text-gray-500 font-medium px-1 mb-1 gap-2">
                          <span>Exercise</span>
                          <span className="text-center">Sets</span>
                          <span className="text-center">Reps</span>
                        </div>
                        {rExercises.map((re) => (
                          <div
                            key={re.id}
                            className="grid grid-cols-[1fr_3rem_3rem] items-center text-sm px-1 py-1 gap-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                          >
                            <span className="text-gray-800 dark:text-gray-100 truncate">{re.exercise.name}</span>
                            <span className="text-gray-500 dark:text-gray-400 text-center">{re.default_sets}</span>
                            <span className="text-gray-500 dark:text-gray-400 text-center">{re.default_reps ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/routines/${routine.id}`}
                        className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                      >
                        Edit routine →
                      </Link>
                      <button
                        onClick={() => deleteRoutine(routine.id)}
                        className="text-sm text-red-400 hover:text-red-600"
                      >
                        Delete routine
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New routine */}
      <Link
        href="/routines/new"
        className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-3 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors mt-4 flex items-center justify-center text-sm"
      >
        + New Routine
      </Link>

      {activeWorkoutId && (
        <WorkoutSheet
          isOpen={sheetOpen}
          workoutId={activeWorkoutId}
          userId={userId}
          allExercises={exercises}
          onClose={() => setSheetOpen(false)}
          onFinish={onWorkoutFinished}
          onDiscard={onWorkoutDiscarded}
          onExerciseCreated={(ex) =>
            setExercises((prev) => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)))
          }
        />
      )}
    </div>
  )
}
