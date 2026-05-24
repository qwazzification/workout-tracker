'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'

const inputClass =
  'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: { user } }, { data: e }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('exercises').select('*').order('name'),
      ])
      setUserId(user?.id ?? '')
      setExercises(e || [])
      setLoading(false)
    }
    load()
  }, [])

  async function addExercise() {
    const name = newExName.trim()
    if (!name) return
    setSaving(true)
    const { data } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExMuscle.trim() || null, user_id: userId })
      .select()
      .single()
    if (data) {
      setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewExName('')
      setNewExMuscle('')
      setShowAddForm(false)
    }
    setSaving(false)
  }

  const exercisesByGroup = exercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const group = ex.muscle_group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(ex)
    return acc
  }, {})

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Exercise Library</h1>
        <button
          onClick={() => { setShowAddForm((v) => !v); setNewExName(''); setNewExMuscle('') }}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700"
        >
          + Add Exercise
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">New custom exercise</p>
          <input
            autoFocus
            value={newExName}
            onChange={(e) => setNewExName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExercise()}
            placeholder="Exercise name"
            className={`w-full ${inputClass}`}
          />
          <input
            value={newExMuscle}
            onChange={(e) => setNewExMuscle(e.target.value)}
            placeholder="Muscle group (optional, e.g. Chest, Back, Legs...)"
            className={`w-full ${inputClass}`}
          />
          <div className="flex gap-2">
            <button
              onClick={addExercise}
              disabled={saving || !newExName.trim()}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {Object.keys(exercisesByGroup).length === 0 ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
          No exercises yet. Add one above.
        </div>
      ) : (
        Object.entries(exercisesByGroup)
          .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
          .map(([group, exes]) => (
            <div key={group} className="mb-6">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
                {group}
              </h2>
              <div className="space-y-2">
                {exes.map((ex) => {
                  const isCustom = ex.user_id !== null
                  return (
                    <Link
                      key={ex.id}
                      href={`/exercises/${ex.id}`}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{ex.name}</span>
                          {isCustom && (
                            <span className="text-xs bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                              Custom
                            </span>
                          )}
                        </div>
                        {ex.notes && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{ex.notes}</p>
                        )}
                      </div>
                      <span className="text-gray-300 dark:text-gray-600 ml-3 shrink-0">›</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
      )}
    </div>
  )
}
