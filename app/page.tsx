'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format, startOfWeek } from 'date-fns'

interface RecentWorkout {
  id: string
  date: string
  routine: { name: string } | null
  sets: { id: string }[]
}

export default function Dashboard() {
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([])
  const [weekCount, setWeekCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd')

      const [{ data: recent }, { count }] = await Promise.all([
        supabase
          .from('workout_logs')
          .select('id, date, routine:routines(name), sets(id)')
          .order('date', { ascending: false })
          .limit(5),
        supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .gte('date', weekStart),
      ])

      setRecentWorkouts((recent as unknown as RecentWorkout[]) || [])
      setWeekCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-4xl font-bold text-blue-600">{weekCount}</div>
          <div className="text-sm text-gray-500 mt-1">Workouts this week</div>
        </div>
        <Link
          href="/log"
          className="bg-blue-600 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-white hover:bg-blue-700 transition-colors"
        >
          <span className="text-3xl">➕</span>
          <span className="text-sm font-semibold mt-1">Log Workout</span>
        </Link>
      </div>

      <h2 className="text-base font-semibold text-gray-700 mb-3">Recent Workouts</h2>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : recentWorkouts.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
          <p className="text-gray-400 mb-3">No workouts logged yet.</p>
          <Link href="/log" className="text-blue-600 text-sm font-medium hover:underline">
            Log your first workout →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {recentWorkouts.map((w) => (
            <div
              key={w.id}
              className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 flex justify-between items-center"
            >
              <div>
                <div className="font-medium text-gray-900">
                  {w.routine?.name ?? 'Workout'}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {format(new Date(w.date + 'T00:00:00'), 'EEE, MMM d')}
                  {' · '}
                  {w.sets.length} set{w.sets.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
