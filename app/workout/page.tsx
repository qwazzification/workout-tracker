'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Routine, Exercise, RoutineExercise } from '@/lib/types'
import WorkoutSheet from '@/components/WorkoutSheet'
import { format } from 'date-fns'

type Tab = 'routines' | 'exercises'
type RoutineExerciseRow = RoutineExercise & { exercise: Exercise }

const inputClass = 'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
const cardClass = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700'

export default function WorkoutPage() {
  const [userId, setUserId] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineExercises, setRoutineExercises] = useState<Record<string, RoutineExerciseRow[]>>({})
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('routines')

  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ exerciseId: '', sets: '3', reps: '' })
  const [newRoutineName, setNewRoutineName] = useState('')
  const [showAddEx, setShowAddEx] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')
  const [editingExId, setEditingExId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '', muscle_group: '', primary_muscle: '', secondary_muscle: '', notes: '', link: '',
  })
  const [saving, setSaving] = useState(false)

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
    const { data } = await supabase
      .from('workout_logs')
      .insert({ date: today, routine_id: routineId ?? null, user_id: userId })
      .select().single()
    if (!data) return
    localStorage.setItem('activeWorkoutId', data.id)
    setActiveWorkoutId(data.id)
    setSheetOpen(true)
  }

  function onWorkoutFinished() {
    localStorage.removeItem('activeWorkoutId')
    setActiveWorkoutId(null)
    setSheetOpen(false)
  }

  async function onWorkoutDiscarded() {
    if (!activeWorkoutId) return
    await supabase.from('workout_logs').delete().eq('id', activeWorkoutId)
    localStorage.removeItem('activeWorkoutId')
    setActiveWorkoutId(null)
    setSheetOpen(false)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id))
    setAddForm({ exerciseId: '', sets: '3', reps: '' })
  }

  async function addRoutine() {
    const name = newRoutineName.trim()
    if (!name) return
    setSaving(true)
    const { data } = await supabase.from('routines').insert({ name, user_id: userId }).select().single()
    if (data) {
      setRoutines((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setRoutineExercises((prev) => ({ ...prev, [data.id]: [] }))
      setNewRoutineName('')
    }
    setSaving(false)
  }

  async function deleteRoutine(id: string) {
    if (!confirm('Delete this routine? Workouts using it will keep their data.')) return
    await supabase.from('routines').delete().eq('id', id)
    setRoutines((prev) => prev.filter((r) => r.id !== id))
    if (expanded === id) setExpanded(null)
  }

  async function addExerciseToRoutine(routineId: string) {
    if (!addForm.exerciseId) return
    const current = routineExercises[routineId] || []
    const { data } = await supabase
      .from('routine_exercises')
      .insert({
        routine_id: routineId,
        exercise_id: addForm.exerciseId,
        default_sets: Math.max(1, parseInt(addForm.sets) || 3),
        default_reps: addForm.reps ? parseInt(addForm.reps) : null,
        sort_order: current.length,
      })
      .select('*, exercise:exercises(*)')
      .single()
    if (data) {
      setRoutineExercises((prev) => ({
        ...prev,
        [routineId]: [...(prev[routineId] || []), data as unknown as RoutineExerciseRow],
      }))
      setAddForm({ exerciseId: '', sets: '3', reps: '' })
    }
  }

  async function moveRoutineExercise(routineId: string, idx: number, dir: 'up' | 'down') {
    const current = routineExercises[routineId] || []
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= current.length) return
    const newOrder = [...current]
    ;[newOrder[idx], newOrder[swap]] = [newOrder[swap], newOrder[idx]]
    setRoutineExercises((prev) => ({ ...prev, [routineId]: newOrder }))
    await Promise.all(
      newOrder.map((re, i) => supabase.from('routine_exercises').update({ sort_order: i }).eq('id', re.id))
    )
  }

  async function removeExerciseFromRoutine(reId: string, routineId: string) {
    await supabase.from('routine_exercises').delete().eq('id', reId)
    setRoutineExercises((prev) => ({
      ...prev,
      [routineId]: prev[routineId].filter((re) => re.id !== reId),
    }))
  }

  async function addExerciseToLibrary() {
    const name = newExName.trim()
    if (!name) return
    setSaving(true)
    const { data } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExMuscle.trim() || null, user_id: userId })
      .select().single()
    if (data) {
      setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewExName('')
      setNewExMuscle('')
      setShowAddEx(false)
    }
    setSaving(false)
  }

  function startEditExercise(ex: Exercise) {
    setEditingExId(ex.id)
    setEditForm({
      name: ex.name,
      muscle_group: ex.muscle_group ?? '',
      primary_muscle: ex.primary_muscle ?? '',
      secondary_muscle: ex.secondary_muscle ?? '',
      notes: ex.notes ?? '',
      link: ex.link ?? '',
    })
  }

  async function saveExercise() {
    if (!editingExId || !editForm.name.trim()) return
    setSaving(true)
    const { data } = await supabase
      .from('exercises')
      .update({
        name: editForm.name.trim(),
        muscle_group: editForm.muscle_group.trim() || null,
        primary_muscle: editForm.primary_muscle.trim() || null,
        secondary_muscle: editForm.secondary_muscle.trim() || null,
        notes: editForm.notes.trim() || null,
        link: editForm.link.trim() || null,
      })
      .eq('id', editingExId)
      .select().single()
    if (data) {
      setExercises((prev) =>
        prev.map((e) => (e.id === editingExId ? (data as Exercise) : e))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditingExId(null)
    }
    setSaving(false)
  }

  async function deleteExercise(id: string) {
    if (!confirm('Delete this exercise? This will fail if it has been used in any logged workouts.')) return
    const { error } = await supabase.from('exercises').delete().eq('id', id)
    if (error) { alert('Cannot delete: ' + error.message); return }
    setExercises((prev) => prev.filter((e) => e.id !== id))
    if (editingExId === id) setEditingExId(null)
  }

  const exercisesByGroup = exercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const group = ex.muscle_group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(ex)
    return acc
  }, {})

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Workout</h1>

      {/* Resume banner */}
      {activeWorkoutId && !sheetOpen && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-blue-900 dark:text-blue-200 text-sm">Workout in progress</div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Your sets are saved — tap to continue</div>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Resume
          </button>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
        {(['routines', 'exercises'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'routines' ? (
        <>
          {/* Start blank workout */}
          <button
            onClick={() => startWorkout()}
            disabled={!!activeWorkoutId}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Start blank workout
          </button>

          {/* Add exercise to library */}
          <div className={`${cardClass} mb-4 overflow-hidden`}>
            <button
              onClick={() => setShowAddEx(!showAddEx)}
              className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <span>+ Add exercise to library</span>
              <span className="text-gray-400 dark:text-gray-500 text-xs">{showAddEx ? '▲' : '▼'}</span>
            </button>
            {showAddEx && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                <input
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  placeholder="Exercise name"
                  className={`w-full ${inputClass}`}
                />
                <div className="flex gap-2">
                  <input
                    value={newExMuscle}
                    onChange={(e) => setNewExMuscle(e.target.value)}
                    placeholder="Muscle group (optional)"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    onClick={addExerciseToLibrary}
                    disabled={saving || !newExName.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >Add</button>
                </div>
              </div>
            )}
          </div>

          {/* New routine */}
          <div className={`${cardClass} p-4 mb-5`}>
            <div className="flex gap-2">
              <input
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addRoutine()}
                placeholder="New routine name (e.g. Push Day)"
                className={`flex-1 ${inputClass}`}
              />
              <button
                onClick={addRoutine}
                disabled={saving || !newRoutineName.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >Add</button>
            </div>
          </div>

          {routines.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">No routines yet. Create one above.</div>
          ) : (
            <div className="space-y-3">
              {routines.map((routine) => {
                const isOpen = expanded === routine.id
                const rExercises = routineExercises[routine.id] || []
                const alreadyAdded = new Set(rExercises.map((re) => re.exercise_id))
                const preview = rExercises.slice(0, 3).map((re) => re.exercise.name).join(', ')

                return (
                  <div key={routine.id} className={`${cardClass} overflow-hidden`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => toggleExpand(routine.id)} className="flex-1 text-left min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-white">{routine.name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                          {rExercises.length === 0
                            ? 'No exercises'
                            : `${preview}${rExercises.length > 3 ? ` +${rExercises.length - 3} more` : ''}`}
                        </div>
                      </button>
                      <button
                        onClick={() => startWorkout(routine.id)}
                        disabled={!!activeWorkoutId}
                        className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Start
                      </button>
                    </div>

                    {isOpen && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3">
                        {rExercises.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">No exercises yet.</p>
                        ) : (
                          <div className="mb-4 space-y-2">
                            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] text-xs text-gray-400 dark:text-gray-500 font-medium px-1 mb-1 gap-2">
                              <span>Exercise</span><span>Sets</span><span>Reps</span><span /><span />
                            </div>
                            {rExercises.map((re, idx) => (
                              <div key={re.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center text-sm px-1 gap-2">
                                <span className="text-gray-800 dark:text-gray-100 truncate">{re.exercise.name}</span>
                                <span className="text-gray-500 dark:text-gray-400">{re.default_sets}</span>
                                <span className="text-gray-500 dark:text-gray-400">{re.default_reps ?? '—'}</span>
                                <div className="flex flex-col items-center">
                                  <button onClick={() => moveRoutineExercise(routine.id, idx, 'up')} disabled={idx === 0}
                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none py-0.5">▲</button>
                                  <button onClick={() => moveRoutineExercise(routine.id, idx, 'down')} disabled={idx === rExercises.length - 1}
                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none py-0.5">▼</button>
                                </div>
                                <button onClick={() => removeExerciseFromRoutine(re.id, routine.id)}
                                  className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-2">
                          <select
                            value={addForm.exerciseId}
                            onChange={(e) => setAddForm((p) => ({ ...p, exerciseId: e.target.value }))}
                            className={`w-full ${inputClass}`}
                          >
                            <option value="">Add exercise...</option>
                            {exercises.filter((ex) => !alreadyAdded.has(ex.id)).map((ex) => (
                              <option key={ex.id} value={ex.id}>{ex.name}</option>
                            ))}
                          </select>
                          <div className="flex gap-2 items-center">
                            <input type="number" min="1" max="20" value={addForm.sets}
                              onChange={(e) => setAddForm((p) => ({ ...p, sets: e.target.value }))}
                              placeholder="Sets"
                              className={`flex-1 min-w-0 text-center ${inputClass}`}
                            />
                            <input type="number" min="1" max="100" value={addForm.reps}
                              onChange={(e) => setAddForm((p) => ({ ...p, reps: e.target.value }))}
                              placeholder="Reps"
                              className={`flex-1 min-w-0 text-center ${inputClass}`}
                            />
                            <button
                              onClick={() => addExerciseToRoutine(routine.id)}
                              disabled={!addForm.exerciseId}
                              className="shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                            >Add</button>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">Sets · Reps = defaults pre-filled when starting</p>
                        </div>

                        <button onClick={() => deleteRoutine(routine.id)}
                          className="mt-4 text-sm text-red-400 hover:text-red-600">Delete routine</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div>
          {Object.keys(exercisesByGroup).length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">No exercises yet.</div>
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
                      <div key={ex.id} className={`${cardClass} overflow-hidden`}>
                        <button
                          onClick={() => {
                            if (!isCustom) return
                            editingExId === ex.id ? setEditingExId(null) : startEditExercise(ex)
                          }}
                          className={`w-full text-left px-4 py-3 flex justify-between items-center ${!isCustom ? 'cursor-default' : ''}`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">{ex.name}</span>
                              {isCustom && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">Custom</span>
                              )}
                            </div>
                            {ex.notes && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-xs">{ex.notes}</p>
                            )}
                          </div>
                          {isCustom && (
                            <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">{editingExId === ex.id ? '▲' : '▼'}</span>
                          )}
                        </button>

                        {isCustom && editingExId === ex.id && (
                          <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3 space-y-3">
                            {[
                              { key: 'name', label: 'Name', placeholder: '' },
                              { key: 'muscle_group', label: 'Muscle Group', placeholder: 'e.g. Chest, Back, Legs...' },
                              { key: 'primary_muscle', label: 'Primary muscle', placeholder: 'e.g. Triceps, Shoulders...' },
                              { key: 'secondary_muscle', label: 'Secondary muscles', placeholder: 'e.g. Triceps, Shoulders...' },
                            ].map(({ key, label, placeholder }) => (
                              <div key={key}>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
                                <input
                                  value={editForm[key as keyof typeof editForm]}
                                  onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                                  placeholder={placeholder}
                                  className={`w-full ${inputClass}`}
                                />
                              </div>
                            ))}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
                              <textarea
                                value={editForm.notes}
                                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                                rows={3}
                                placeholder="Form cues, tips, reminders..."
                                className={`w-full resize-none ${inputClass}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Link (optional)</label>
                              <input
                                type="url"
                                value={editForm.link}
                                onChange={(e) => setEditForm((p) => ({ ...p, link: e.target.value }))}
                                placeholder="https://..."
                                className={`w-full ${inputClass}`}
                              />
                            </div>
                            <div className="flex gap-3 pt-1">
                              <button
                                onClick={saveExercise}
                                disabled={saving || !editForm.name.trim()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                              >Save</button>
                              <button onClick={() => setEditingExId(null)}
                                className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200 px-2">Cancel</button>
                              <button onClick={() => deleteExercise(ex.id)}
                                className="ml-auto text-sm text-red-400 hover:text-red-600">Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                    })}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

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
