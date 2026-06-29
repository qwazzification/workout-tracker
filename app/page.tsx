'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format, startOfWeek, subWeeks } from 'date-fns'

type Profile = { id: string; display_name: string | null; email: string | null }

// Consecutive weeks (most recent backward) with at least one logged workout.
// The current week not being logged yet doesn't break the streak — it only
// breaks once a fully-elapsed week passes with no workout.
function computeWeekStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const weeks = new Set(dates.map((d) => format(startOfWeek(new Date(d + 'T00:00:00')), 'yyyy-MM-dd')))
  let cursor = startOfWeek(new Date())
  if (!weeks.has(format(cursor, 'yyyy-MM-dd'))) cursor = subWeeks(cursor, 1)
  let streak = 0
  while (weeks.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++
    cursor = subWeeks(cursor, 1)
  }
  return streak
}

type FeedWorkout = {
  id: string
  date: string
  name: string | null
  notes: string | null
  is_public: boolean
  user_id: string
  routine: { name: string } | null
  sets: { exercise: { id: string; name: string } | null }[]
}

function dedupeExercises(sets: FeedWorkout['sets']): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  sets.forEach((s) => {
    if (s.exercise && !seen.has(s.exercise.id)) {
      seen.add(s.exercise.id)
      names.push(s.exercise.name)
    }
  })
  return names
}

export default function FeedPage() {
  const [myId, setMyId] = useState<string | null>(null)
  const [myInitial, setMyInitial] = useState('?')
  const [weekCount, setWeekCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedWorkouts, setFeedWorkouts] = useState<FeedWorkout[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const meta = user.user_metadata ?? {}
      const name = (meta.display_name as string | undefined) || user.email?.split('@')[0] || '?'
      setMyInitial(name[0].toUpperCase())

      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd')

      // Accepted friend IDs
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

      const friendIds = (friendships ?? []).map((f) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      )

      // Fetch own + friends' workouts in parallel
      const FIELDS = 'id, date, name, notes, is_public, user_id, routine:routines(name), sets(exercise:exercises(id, name))'

      const [{ data: ownData }, friendResult, { count }, { data: allDates }] = await Promise.all([
        supabase
          .from('workout_logs')
          .select(FIELDS)
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(20),
        friendIds.length > 0
          ? supabase
              .from('workout_logs')
              .select(FIELDS)
              .in('user_id', friendIds)
              .eq('is_public', true)
              .order('date', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
        supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('date', weekStart),
        supabase
          .from('workout_logs')
          .select('date')
          .eq('user_id', user.id),
      ])

      setWeekCount(count ?? 0)
      setStreak(computeWeekStreak(((allDates as { date: string }[] | null) ?? []).map((d) => d.date)))

      const all = [
        ...((ownData as unknown as FeedWorkout[]) ?? []),
        ...((friendResult.data as unknown as FeedWorkout[]) ?? []),
      ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30)

      setFeedWorkouts(all)

      // Load profiles for any friend authors in the feed
      const authorIds = [...new Set(all.map((w) => w.user_id).filter((id) => id !== user.id))]
      if (authorIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .in('id', authorIds)
        const map: Record<string, Profile> = {}
        ;((profileData as Profile[]) ?? []).forEach((p) => { map[p.id] = p })
        setProfiles(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  function getWorkoutName(w: FeedWorkout) {
    return w.name ?? (w.routine as { name: string } | null)?.name ?? 'Workout'
  }

  function getAuthorName(userId: string) {
    const p = profiles[userId]
    return p?.display_name || p?.email?.split('@')[0] || 'Friend'
  }

  function getAuthorInitial(userId: string) {
    return getAuthorName(userId)[0].toUpperCase()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Feed</h1>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-4xl font-bold text-brand-500">{streak}{streak > 0 && ' 🔥'}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Week streak
            <span className="block text-xs text-gray-400 dark:text-gray-500">
              {streak === 0 ? 'Log a workout this week to start one' : `${streak} week${streak === 1 ? '' : 's'} in a row`}
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-4xl font-bold text-brand-500">{weekCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Workouts this week</div>
        </div>
      </div>
      <Link
        href="/workout"
        className="bg-brand-700 rounded-xl p-4 shadow-sm flex items-center justify-center gap-2 text-white hover:bg-brand-600 transition-colors mb-6"
      >
        <span className="text-xl">💪</span>
        <span className="text-sm font-semibold">Start Workout</span>
      </Link>

      {/* Feed */}
      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      ) : feedWorkouts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-100 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 mb-3">No workouts yet. Log one or add some friends!</p>
          <Link href="/workout" className="text-brand-600 text-sm font-medium hover:underline">
            Start your first workout →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {feedWorkouts.map((w) => {
            const isOwn = w.user_id === myId
            const exercises = dedupeExercises(w.sets)

            return (
              <div
                key={w.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
              >
                {/* Author row */}
                <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 border-b border-gray-50 dark:border-gray-700/50">
                  {isOwn ? (
                    <Link
                      href="/progress"
                      className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0"
                    >
                      <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{myInitial}</span>
                    </Link>
                  ) : (
                    <Link
                      href={`/profile/${w.user_id}`}
                      className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0"
                    >
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{getAuthorInitial(w.user_id)}</span>
                    </Link>
                  )}
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex-1 min-w-0 truncate">
                    {isOwn ? 'You' : (
                      <Link href={`/profile/${w.user_id}`} className="hover:text-brand-400 transition-colors">
                        {getAuthorName(w.user_id)}
                      </Link>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {format(new Date(w.date + 'T00:00:00'), 'MMM d')}
                  </span>
                  {isOwn && !w.is_public && (
                    <span className="text-xs text-gray-500 dark:text-gray-600 shrink-0" title="Private">🔒</span>
                  )}
                </div>

                {/* Workout body */}
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">
                      {getWorkoutName(w)}
                    </div>
                    {isOwn && (
                      <Link
                        href={`/workouts/${w.id}`}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-400 font-medium shrink-0 ml-2 transition-colors"
                      >
                        View →
                      </Link>
                    )}
                  </div>
                  {w.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-2">{`"${w.notes}"`}</p>
                  )}
                  {exercises.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {exercises.map((ex) => (
                        <span
                          key={ex}
                          className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
