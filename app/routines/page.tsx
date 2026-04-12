'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Routine, Exercise, RoutineExercise } from '@/lib/types'

type Tab = 'routines' | 'exercises'
type RoutineExerciseRow = RoutineExercise & { exercise: Exercise }

export default function Routines() {
  const [tab, setTab] = useState<Tab>('routines')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineExercises, setRoutineExercises] = useState<Record<string, RoutineExerciseRow[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // New routine form
  const [newRoutineName, setNewRoutineName] = useState('')

  // Add custom exercise form (Routines tab)
  const [showAddEx, setShowAddEx] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  // Add exercise to routine form
  const [addForm, setAddForm] = useState({ exerciseId: '', sets: '3', reps: '' })

  // Exercise editing state (Exercises tab)
  const [editingExId, setEditingExId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', muscle_group: '', notes: '', link: '' })

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: e }, { data: re }] = await Promise.all([
        supabase.from('routines').select('*').order('name'),
        supabase.from('exercises').select('*').order('name'),
        supabase
          .from('routine_exercises')
          .select('*, exercise:exercises(*)')
          .order('sort_order'),
      ])
      setRoutines(r || [])
      setExercises(e || [])

      const grouped: Record<string, RoutineExerciseRow[]> = {}
      ;(re || []).forEach((item: RoutineExerciseRow) => {
        if (!grouped[item.routine_id]) grouped[item.routine_id] = []
        grouped[item.routine_id].push(item)
      })
      setRoutineExercises(grouped)
      setLoading(false)
    }
    load()
  }, [])

  // ── Routines tab ──────────────────────────────────────────

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    setAddForm({ exerciseId: '', sets: '3', reps: '' })
  }

  async function addRoutine() {
    const name = newRoutineName.trim()
    if (!name) return
    setSaving(true)
    const { data } = await supabase.from('routines').insert({ name }).select().single()
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

  async function addExerciseToLibrary() {
    const name = newExName.trim()
    if (!name) return
    setSaving(true)
    const { data } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExMuscle.trim() || null })
      .select()
      .single()
    if (data) {
      setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewExName('')
      setNewExMuscle('')
      setShowAddEx(false)
    }
    setSaving(false)
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
        [routineId]: [...(prev[routineId] || []), data as RoutineExerciseRow],
      }))
      setAddForm({ exerciseId: '', sets: '3', reps: '' })
    }
  }

  async function removeExerciseFromRoutine(reId: string, routineId: string) {
    await supabase.from('routine_exercises').delete().eq('id', reId)
    setRoutineExercises((prev) => ({
      ...prev,
      [routineId]: prev[routineId].filter((re) => re.id !== reId),
    }))
  }

  // ── Exercises tab ─────────────────────────────────────────

  function startEditExercise(ex: Exercise) {
    setEditingExId(ex.id)
    setEditForm({
      name: ex.name,
      muscle_group: ex.muscle_group ?? '',
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
        notes: editForm.notes.trim() || null,
        link: editForm.link.trim() || null,
      })
      .eq('id', editingExId)
      .select()
      .single()
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

  // Group exercises by muscle group for the Exercises tab
  const exercisesByGroup = exercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const group = ex.muscle_group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(ex)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Routines</h1>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {(['routines', 'exercises'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : tab === 'routines' ? (

        /* ── ROUTINES TAB ── */
        <>
          {/* Add custom exercise */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
            <button
              onClick={() => setShowAddEx(!showAddEx)}
              className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span>+ Add custom exercise to library</span>
              <span className="text-gray-400 text-xs">{showAddEx ? '▲' : '▼'}</span>
            </button>
            {showAddEx && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
                <input
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  placeholder="Exercise name"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    value={newExMuscle}
                    onChange={(e) => setNewExMuscle(e.target.value)}
                    placeholder="Muscle group (optional)"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Create new routine */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
            <div className="flex gap-2">
              <input
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addRoutine()}
                placeholder="New routine name (e.g. Push Day)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addRoutine}
                disabled={saving || !newRoutineName.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >Add</button>
            </div>
          </div>

          {routines.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">No routines yet.</div>
          ) : (
            <div className="space-y-3">
              {routines.map((routine) => {
                const isOpen = expanded === routine.id
                const rExercises = routineExercises[routine.id] || []
                const alreadyAdded = new Set(rExercises.map((re) => re.exercise_id))

                return (
                  <div key={routine.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => toggleExpand(routine.id)}
                      className="w-full text-left px-4 py-3 flex justify-between items-center"
                    >
                      <div>
                        <span className="font-semibold text-gray-900">{routine.name}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {rExercises.length} exercise{rExercises.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                        {rExercises.length === 0 ? (
                          <p className="text-sm text-gray-400 mb-4">No exercises yet.</p>
                        ) : (
                          <div className="mb-4 space-y-2">
                            <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs text-gray-400 font-medium px-1 mb-1">
                              <span>Exercise</span>
                              <span className="mr-3">Sets</span>
                              <span className="mr-4">Reps</span>
                              <span />
                            </div>
                            {rExercises.map((re) => (
                              <div key={re.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center text-sm px-1">
                                <span className="text-gray-800">{re.exercise.name}</span>
                                <span className="text-gray-500 mr-3">{re.default_sets}</span>
                                <span className="text-gray-500 mr-4">{re.default_reps ?? '—'}</span>
                                <button
                                  onClick={() => removeExerciseFromRoutine(re.id, routine.id)}
                                  className="text-red-400 hover:text-red-600 text-lg leading-none"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add exercise to routine */}
                        <div className="flex gap-2 items-center">
                          <select
                            value={addForm.exerciseId}
                            onChange={(e) => setAddForm((p) => ({ ...p, exerciseId: e.target.value }))}
                            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Add exercise...</option>
                            {exercises
                              .filter((ex) => !alreadyAdded.has(ex.id))
                              .map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                          </select>
                          <input
                            type="number" min="1" max="20" value={addForm.sets}
                            onChange={(e) => setAddForm((p) => ({ ...p, sets: e.target.value }))}
                            title="Default sets"
                            placeholder="Sets"
                            className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="number" min="1" max="100" value={addForm.reps}
                            onChange={(e) => setAddForm((p) => ({ ...p, reps: e.target.value }))}
                            title="Default reps"
                            placeholder="Reps"
                            className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => addExerciseToRoutine(routine.id)}
                            disabled={!addForm.exerciseId}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                          >Add</button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 pl-1">
                          Sets · Reps = defaults pre-filled when loading template
                        </p>

                        <button
                          onClick={() => deleteRoutine(routine.id)}
                          className="mt-4 text-sm text-red-400 hover:text-red-600"
                        >Delete routine</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>

      ) : (

        /* ── EXERCISES TAB ── */
        <div>
          {Object.keys(exercisesByGroup).length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">No exercises yet.</div>
          ) : (
            Object.entries(exercisesByGroup)
              .sort(([a], [b]) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
              .map(([group, exes]) => (
                <div key={group} className="mb-6">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                    {group}
                  </h2>
                  <div className="space-y-2">
                    {exes.map((ex) => (
                      <div key={ex.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <button
                          onClick={() => editingExId === ex.id ? setEditingExId(null) : startEditExercise(ex)}
                          className="w-full text-left px-4 py-3 flex justify-between items-center"
                        >
                          <div>
                            <span className="font-medium text-gray-900">{ex.name}</span>
                            {ex.notes && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{ex.notes}</p>
                            )}
                          </div>
                          <span className="text-gray-400 text-xs ml-2">{editingExId === ex.id ? '▲' : '▼'}</span>
                        </button>

                        {editingExId === ex.id && (
                          <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                              <input
                                value={editForm.name}
                                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Muscle group</label>
                              <input
                                value={editForm.muscle_group}
                                onChange={(e) => setEditForm((p) => ({ ...p, muscle_group: e.target.value }))}
                                placeholder="e.g. Chest, Back, Legs..."
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                              <textarea
                                value={editForm.notes}
                                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                                rows={3}
                                placeholder="Form cues, tips, reminders..."
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Link (optional)</label>
                              <input
                                type="url"
                                value={editForm.link}
                                onChange={(e) => setEditForm((p) => ({ ...p, link: e.target.value }))}
                                placeholder="https://..."
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex gap-3 pt-1">
                              <button
                                onClick={saveExercise}
                                disabled={saving || !editForm.name.trim()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                              >Save</button>
                              <button
                                onClick={() => setEditingExId(null)}
                                className="text-gray-500 text-sm hover:text-gray-700 px-2"
                              >Cancel</button>
                              <button
                                onClick={() => deleteExercise(ex.id)}
                                className="ml-auto text-sm text-red-400 hover:text-red-600"
                              >Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}
