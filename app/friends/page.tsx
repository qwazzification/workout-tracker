'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Profile = { id: string; email: string | null; display_name: string | null }

type Friendship = {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  requester: Profile | null
  addressee: Profile | null
}

function displayName(p: Profile | null) {
  return p?.display_name || p?.email?.split('@')[0] || 'Unknown'
}

function initial(p: Profile | null) {
  return (p?.display_name || p?.email || '?')[0].toUpperCase()
}

export default function FriendsPage() {
  const router = useRouter()
  const [myId, setMyId] = useState<string | null>(null)
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState<Profile | 'notfound' | null>(null)
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      setMyId(user.id)
      const { data } = await supabase
        .from('friendships')
        .select('*, requester:profiles!requester_id(id, email, display_name), addressee:profiles!addressee_id(id, email, display_name)')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      setFriendships((data as unknown as Friendship[]) || [])
      setLoading(false)
    })
  }, [])

  async function searchUser() {
    if (!searchEmail.trim() || !myId) return
    setSearching(true)
    setSearchResult(null)
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('email', searchEmail.trim().toLowerCase())
      .neq('id', myId)
      .maybeSingle()
    setSearchResult(data ? (data as Profile) : 'notfound')
    setSearching(false)
  }

  function existingRelationship(userId: string) {
    return friendships.find(
      (f) =>
        (f.requester_id === myId && f.addressee_id === userId) ||
        (f.requester_id === userId && f.addressee_id === myId)
    )
  }

  async function sendRequest(addresseeId: string) {
    if (!myId) return
    setSending(true)
    const { data } = await supabase
      .from('friendships')
      .insert({ requester_id: myId, addressee_id: addresseeId })
      .select('*, requester:profiles!requester_id(id, email, display_name), addressee:profiles!addressee_id(id, email, display_name)')
      .single()
    if (data) {
      setFriendships((prev) => [...prev, data as unknown as Friendship])
      setSearchResult(null)
      setSearchEmail('')
    }
    setSending(false)
  }

  async function respond(id: string, accept: boolean) {
    const { data } = await supabase
      .from('friendships')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', id)
      .select('*, requester:profiles!requester_id(id, email, display_name), addressee:profiles!addressee_id(id, email, display_name)')
      .single()
    if (data) setFriendships((prev) => prev.map((f) => (f.id === id ? (data as unknown as Friendship) : f)))
  }

  async function removeFriendship(id: string) {
    await supabase.from('friendships').delete().eq('id', id)
    setFriendships((prev) => prev.filter((f) => f.id !== id))
  }

  function getFriend(f: Friendship): Profile | null {
    return f.requester_id === myId ? f.addressee : f.requester
  }

  const incoming = friendships.filter((f) => f.addressee_id === myId && f.status === 'pending')
  const outgoing = friendships.filter((f) => f.requester_id === myId && f.status === 'pending')
  const accepted = friendships.filter((f) => f.status === 'accepted')

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

      <h1 className="flex justify-start my-4 text-xl font-bold text-gray-900 dark:text-white">Friends</h1>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      ) : (
        <div className="space-y-4">

          {/* Find people */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Find people</h2>
            <div className="flex gap-2">
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                placeholder="Search by email address"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={searchUser}
                disabled={searching || !searchEmail.trim()}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {searching ? '…' : 'Search'}
              </button>
            </div>

            {searchResult !== null && (
              <div className="mt-3">
                {searchResult === 'notfound' ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No user found with that email.</p>
                ) : (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{initial(searchResult)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName(searchResult)}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{searchResult.email}</div>
                    </div>
                    {(() => {
                      const rel = existingRelationship(searchResult.id)
                      if (rel?.status === 'accepted') return <span className="text-xs text-green-500 font-medium shrink-0">Friends ✓</span>
                      if (rel) return <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Request pending</span>
                      return (
                        <button
                          onClick={() => sendRequest((searchResult as Profile).id)}
                          disabled={sending}
                          className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shrink-0"
                        >
                          {sending ? '…' : 'Add friend'}
                        </button>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-brand-200 dark:border-brand-900">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                Friend requests
                <span className="ml-1.5 text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded-full">{incoming.length}</span>
              </h2>
              <div className="space-y-3">
                {incoming.map((f) => (
                  <div key={f.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{initial(f.requester)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName(f.requester)}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{f.requester?.email}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => respond(f.id, true)}
                        className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-700 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(f.id, false)}
                        className="text-xs bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends list */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              Friends
              {accepted.length > 0 && (
                <span className="text-gray-400 dark:text-gray-500 font-normal ml-1.5">({accepted.length})</span>
              )}
            </h2>

            {accepted.length === 0 && outgoing.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No friends yet — search above to find people.</p>
            ) : (
              <div className="space-y-3">
                {accepted.map((f) => {
                  const p = getFriend(f)
                  return (
                    <div key={f.id} className="flex items-center gap-3">
                      <Link
                        href={`/profile/${p?.id}`}
                        className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0"
                      >
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{initial(p)}</span>
                      </Link>
                      <Link href={`/profile/${p?.id}`} className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 truncate transition-colors">
                          {displayName(p)}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{p?.email}</div>
                      </Link>
                      <button
                        onClick={() => removeFriendship(f.id)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 shrink-0 transition-colors"
                      >
                        Unfriend
                      </button>
                    </div>
                  )
                })}

                {/* Pending outgoing */}
                {outgoing.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 opacity-60">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{initial(f.addressee)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName(f.addressee)}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">Request sent</div>
                    </div>
                    <button
                      onClick={() => removeFriendship(f.id)}
                      className="text-xs text-gray-400 hover:text-red-400 px-2 shrink-0 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
