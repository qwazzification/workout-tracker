'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import type { Routine } from '@/lib/types'

type RoutineExRow = {
  id: string
  routine_id: string
  exercise_id: string
  default_sets: number
  default_reps: number | null
  sort_order: number
  exercise: { id: string; name: string } | null
}

type WorkoutLogRow = {
  id: string
  date: string
  routine_id: string | null
}

export default function RoutinesPage() {
  const router = useRouter()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineExercises, setRoutineExercises] = useState<Record<string, RoutineExRow[]>>({})
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLogRow[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: re }, { data: wl }] = await Promise.all([
        supabase.from('routines').select('*').order('name'),
        supabase.from('routine_exercises').select('*, exercise:exercises(id, name)').order('sort_order'),
        supabase.from('workout_logs').select('id, date, routine_id').order('date', { ascending: false }),
      ])

      setRoutines((r as Routine[]) || [])
      setWorkoutLogs((wl as WorkoutLogRow[]) || [])

      const grouped: Record<string, RoutineExRow[]> = {}
      ;((re || []) as unknown as RoutineExRow[]).forEach((item) => {
        if (!grouped[item.routine_id]) grouped[item.routine_id] = []
        grouped[item.routine_id].push(item)
      })
      setRoutineExercises(grouped)
      setLoading(false)
    }
    load()
  }, [])

  // Per-routine completion stats
  const routineStats = useMemo(() => {
    const stats: Record<string, { count: number; lastDate: string | null }> = {}
    workoutLogs.forEach((w) => {
      if (!w.routine_id) return
      if (!stats[w.routine_id]) stats[w.routine_id] = { count: 0, lastDate: null }
      stats[w.routine_id].count++
      if (!stats[w.routine_id].lastDate || w.date > stats[w.routine_id].lastDate!) {
        stats[w.routine_id].lastDate = w.date
      }
    })
    return stats
  }, [workoutLogs])

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id))
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="grid grid-cols-2 items-center w-full">
        <div className="justify-self-start">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 h-6 px-3 rounded-lg bg-gray-800 border border-gray-500 text-gray-400 dark:text-gray-500 hover:text-gray-300 text-xs shrink-0 transition-colors"
          >
            <span>←</span> Back
          </button>
        </div>
        <div className="justify-self-end">
          <Link
            href="/routines/new"
            className="flex items-center gap-1.5 h-6 px-3 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
          >
            + New Routine
          </Link>
        </div>
      </div>

      <h1 className="flex justify-start my-4 text-xl font-bold text-gray-900 dark:text-white">
        Routines
      </h1>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      ) : routines.length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">
          <p className="mb-3">No routines yet.</p>
          <Link href="/routines/new" className="text-brand-600 font-medium hover:underline">
            Create your first routine →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map((routine) => {
            const rExercises = routineExercises[routine.id] || []
            const stats = routineStats[routine.id] ?? { count: 0, lastDate: null }
            const isOpen = expanded === routine.id

            return (
              <div key={routine.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Card header */}
                <div className="flex items-center px-4 py-3 gap-2">
                  <Link href={`/routines/${routine.id}`} className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate">
                      {routine.name}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex gap-2 flex-wrap">
                      <span>{rExercises.length} exercise{rExercises.length !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>Done {stats.count} time{stats.count !== 1 ? 's' : ''}</span>
                      {stats.lastDate && (
                        <>
                          <span>·</span>
                          <span>Last: {format(new Date(stats.lastDate + 'T00:00:00'), 'MMM d, yyyy')}</span>
                        </>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => toggleExpand(routine.id)}
                    className="shrink-0 p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-xs"
                  >
                    {isOpen ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded exercise list */}
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
                    {rExercises.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">No exercises in this routine.</p>
                    ) : (
                      <div className="space-y-1.5 mb-3">
                        {rExercises.map((re, idx) => (
                          <div key={re.id} className="flex items-center gap-2 text-sm">
                            <span className="text-xs text-gray-400 dark:text-gray-500 w-4 text-center shrink-0">{idx + 1}</span>
                            <Link
                              href={`/exercises/${re.exercise?.id}`}
                              className="flex-1 text-gray-800 dark:text-gray-200 hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate"
                            >
                              {re.exercise?.name ?? 'Unknown'}
                            </Link>
                            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                              {re.default_sets} × {re.default_reps ?? '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                      <Link
                        href={`/routines/${routine.id}`}
                        className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline"
                      >
                        View stats &amp; edit →
                      </Link>
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
