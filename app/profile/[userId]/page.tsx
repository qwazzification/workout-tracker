'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

type ProfileData = { id: string; email: string | null; display_name: string | null; created_at: string }
type Friendship = { id: string; requester_id: string; addressee_id: string; status: string }
type WorkoutCard = { id: string; date: string; name: string | null; notes: string | null; exercises: string[] }

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()

  const [myId, setMyId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [friendship, setFriendship] = useState<Friendship | null>(null)
  const [workouts, setWorkouts] = useState<WorkoutCard[]>([])
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      // Redirect own profile to the real profile page
      if (user.id === userId) { router.replace('/progress'); return }
      setMyId(user.id)

      const [{ data: p }, { data: f }, { data: wl }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase
          .from('friendships')
          .select('*')
          .or(
            `and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`
          )
          .maybeSingle(),
        supabase
          .from('workout_logs')
          .select('id, date, name, notes, sets(exercise:exercises(id, name))')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('date', { ascending: false })
          .limit(20),
      ])

      setProfile(p as ProfileData)
      setFriendship(f as Friendship | null)

      type RawSet = { exercise: { id: string; name: string } | null }
      type RawLog = { id: string; date: string; name: string | null; notes: string | null; sets: RawSet[] }
      const raw = (wl as unknown as RawLog[]) ?? []

      setWorkouts(
        raw.map((w) => {
          const seen = new Set<string>()
          const exercises: string[] = []
          w.sets.forEach((s) => {
            if (s.exercise && !seen.has(s.exercise.id)) {
              seen.add(s.exercise.id)
              exercises.push(s.exercise.name)
            }
          })
          return { id: w.id, date: w.date, name: w.name, notes: w.notes, exercises }
        })
      )

      setLoading(false)
    }
    load()
  }, [userId])

  async function sendRequest() {
    if (!myId) return
    setActionPending(true)
    const { data } = await supabase
      .from('friendships')
      .insert({ requester_id: myId, addressee_id: userId })
      .select()
      .single()
    if (data) setFriendship(data as Friendship)
    setActionPending(false)
  }

  async function acceptRequest() {
    if (!friendship) return
    setActionPending(true)
    const { data } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendship.id)
      .select()
      .single()
    if (data) setFriendship(data as Friendship)
    setActionPending(false)
  }

  async function removeFriendship() {
    if (!friendship) return
    setActionPending(true)
    await supabase.from('friendships').delete().eq('id', friendship.id)
    setFriendship(null)
    setActionPending(false)
  }

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  if (!profile) return (
    <div className="text-center py-16">
      <p className="text-gray-400 dark:text-gray-500 mb-4">User not found.</p>
      <button onClick={() => router.back()} className="text-brand-600 hover:underline text-sm">← Back</button>
    </div>
  )

  const name = profile.display_name || profile.email?.split('@')[0] || 'User'
  const avatarInitial = name[0].toUpperCase()
  const memberSince = format(new Date(profile.created_at), 'MMM yyyy')

  let friendButton: React.ReactNode = null
  if (!friendship) {
    friendButton = (
      <button
        onClick={sendRequest}
        disabled={actionPending}
        className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        Add friend
      </button>
    )
  } else if (friendship.status === 'accepted') {
    friendButton = (
      <button
        onClick={removeFriendship}
        disabled={actionPending}
        className="text-xs bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-600 disabled:opacity-50 transition-colors"
      >
        Friends ✓
      </button>
    )
  } else if (friendship.status === 'pending' && friendship.requester_id === myId) {
    friendButton = (
      <button
        onClick={removeFriendship}
        disabled={actionPending}
        className="text-xs bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-600 disabled:opacity-50 transition-colors"
      >
        Requested ×
      </button>
    )
  } else if (friendship.status === 'pending' && friendship.addressee_id === myId) {
    friendButton = (
      <div className="flex gap-2">
        <button
          onClick={acceptRequest}
          disabled={actionPending}
          className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          Accept
        </button>
        <button
          onClick={removeFriendship}
          disabled={actionPending}
          className="text-xs bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          Decline
        </button>
      </div>
    )
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
        <div className="w-full" />
      </div>

      {/* Profile header */}
      <div className="flex items-center gap-4 my-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-brand-600 dark:text-brand-400">{avatarInitial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{name}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Member since {memberSince}</p>
        </div>
        {friendButton}
      </div>

      {/* Public workouts */}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Recent workouts</h2>

      {workouts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-400 dark:text-gray-500">No public workouts yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workouts.map((w) => (
            <div key={w.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="font-semibold text-gray-900 dark:text-white text-sm mb-0.5">
                {w.name ?? 'Workout'}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                {format(new Date(w.date + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
              </div>
              {w.notes && (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-2">{`"${w.notes}"`}</p>
              )}
              {w.exercises.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {w.exercises.map((ex) => (
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
          ))}
        </div>
      )}

      {/* Friends link at bottom */}
      <div className="mt-6 text-center">
        <Link href="/friends" className="text-xs text-gray-400 dark:text-gray-500 hover:text-brand-400 transition-colors">
          Manage your friends →
        </Link>
      </div>
    </div>
  )
}
