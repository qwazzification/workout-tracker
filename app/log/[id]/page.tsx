'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Routine, Exercise } from '@/lib/types'

interface SetEntry {
  reps: string
  weight: string
}

interface ExerciseEntry {
  exercise_id: string
  sets: SetEntry[]
  notes: string
}

export default function EditWorkout() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [date, setDate] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routineId, setRoutineId] = useState('')
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState<ExerciseEntry[]>([])
  const [saving, setSaving] = useState(false)

  // Inline exercise creation
  const [creatingForIdx, setCreatingForIdx] = useState<number | null>(null)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: e }, { data: log }, { data: setRows }, { data: exNotes }] =
        await Promise.all([
          supabase.from('routines').select('*').order('name'),
          supabase.from('exercises').select('*').order('name'),
          supabase
            .from('workout_logs')
            .select('id, date, routine_id, notes')
            .eq('id', id)
            .single(),
          supabase
            .from('sets')
            .select('exercise_id, set_number, reps, weight')
            .eq('workout_log_id', id)
            .order('created_at', { ascending: true }),
          supabase
            .from('workout_exercise_notes')
            .select('exercise_id, notes')
            .eq('workout_log_id', id),
        ])

      setRoutines(r || [])
      setExercises(e || [])

      if (!log) { setNotFound(true); setLoading(false); return }

      setDate(log.date)
      setRoutineId(log.routine_id ?? '')
      setNotes(log.notes ?? '')

      // Group sets by exercise_id in insertion order, sort each group by set_number
      const notesMap = new Map((exNotes || []).map((n: { exercise_id: string; notes: string }) => [n.exercise_id, n.notes]))
      const exerciseMap = new Map<string, SetEntry[]>()
      ;(setRows || []).forEach((s: { exercise_id: string; set_number: number; reps: number | null; weight: number | null }) => {
        if (!exerciseMap.has(s.exercise_id)) exerciseMap.set(s.exercise_id, [])
        exerciseMap.get(s.exercise_id)!.push({
          reps: s.reps?.toString() ?? '',
          weight: s.weight?.toString() ?? '',
        })
      })

      setEntries(
        Array.from(exerciseMap.entries()).map(([exercise_id, sets]) => ({
          exercise_id,
          sets,
          notes: notesMap.get(exercise_id) ?? '',
        }))
      )
      setLoading(false)
    }
    load()
  }, [id])

  function addExercise() {
    setEntries((prev) => [...prev, { exercise_id: '', sets: [{ reps: '', weight: '' }], notes: '' }])
  }

  function removeExercise(exIdx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== exIdx))
  }

  function addSet(exIdx: number) {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== exIdx) return entry
        const last = entry.sets[entry.sets.length - 1]
        const newSet = (last?.reps || last?.weight) ? { ...last } : { reps: '', weight: '' }
        return { ...entry, sets: [...entry.sets, newSet] }
      })
    )
  }

  function removeSet(exIdx: number, setIdx: number) {
    setEntries((prev) => {
      const updated = prev.map((entry, i) => {
        if (i !== exIdx) return entry
        return { ...entry, sets: entry.sets.filter((_, j) => j !== setIdx) }
      })
      return updated.filter((entry) => entry.sets.length > 0)
    })
  }

  function updateExerciseId(exIdx: number, value: string) {
    setEntries((prev) =>
      prev.map((entry, i) => (i !== exIdx ? entry : { ...entry, exercise_id: value }))
    )
  }

  function updateSetField(exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string) {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== exIdx) return entry
        return { ...entry, sets: entry.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: value })) }
      })
    )
  }

  function updateExerciseNotes(exIdx: number, value: string) {
    setEntries((prev) =>
      prev.map((entry, i) => (i !== exIdx ? entry : { ...entry, notes: value }))
    )
  }

  async function createExercise(exIdx: number) {
    const name = newExName.trim()
    if (!name) return
    const { data } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExMuscle.trim() || null })
      .select()
      .single()
    if (data) {
      setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      updateExerciseId(exIdx, data.id)
      setCreatingForIdx(null)
      setNewExName('')
      setNewExMuscle('')
    }
  }

  async function save() {
    if (entries.length === 0) return alert('Add at least one exercise.')
    if (entries.some((e) => !e.exercise_id)) return alert('Select an exercise for each entry.')
    setSaving(true)

    const { error: logError } = await supabase
      .from('workout_logs')
      .update({ date, routine_id: routineId || null, notes: notes.trim() || null })
      .eq('id', id)

    if (logError) { alert('Error: ' + logError.message); setSaving(false); return }

    // Replace all sets and exercise notes
    await Promise.all([
      supabase.from('sets').delete().eq('workout_log_id', id),
      supabase.from('workout_exercise_notes').delete().eq('workout_log_id', id),
    ])

    const setsToInsert = entries.flatMap((entry) =>
      entry.sets.map((set, setIdx) => ({
        workout_log_id: id,
        exercise_id: entry.exercise_id,
        set_number: setIdx + 1,
        reps: set.reps !== '' ? parseInt(set.reps) : null,
        weight: set.weight !== '' ? parseFloat(set.weight) : null,
      }))
    )

    const { error: setsError } = await supabase.from('sets').insert(setsToInsert)
    if (setsError) { alert('Error saving sets: ' + setsError.message); setSaving(false); return }

    const notesToInsert = entries
      .filter((e) => e.notes.trim())
      .map((e) => ({ workout_log_id: id, exercise_id: e.exercise_id, notes: e.notes.trim() }))

    if (notesToInsert.length > 0) {
      await supabase.from('workout_exercise_notes').insert(notesToInsert)
    }

    router.push('/history')
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>
  if (notFound) return (
    <div className="text-center py-16">
      <p className="text-gray-400 mb-4">Workout not found.</p>
      <Link href="/history" className="text-blue-600 hover:underline text-sm">← Back to history</Link>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/history" className="text-gray-400 hover:text-gray-600 text-sm">← History</Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Workout</h1>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Routine (optional)</label>
          <select
            value={routineId}
            onChange={(e) => setRoutineId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No routine</option>
            {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="How did it go?"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      {entries.map((entry, exIdx) => (
        <div key={exIdx} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
          <div className="flex gap-2 mb-1">
            <select
              value={entry.exercise_id}
              onChange={(e) => updateExerciseId(exIdx, e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select exercise...</option>
              {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
            <button
              onClick={() => removeExercise(exIdx)}
              className="text-red-400 hover:text-red-600 px-2 text-lg leading-none"
              title="Remove exercise"
            >×</button>
          </div>

          {creatingForIdx === exIdx ? (
            <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
              <input
                autoFocus
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                placeholder="Exercise name"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <input
                  value={newExMuscle}
                  onChange={(e) => setNewExMuscle(e.target.value)}
                  placeholder="Muscle group (optional)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => createExercise(exIdx)}
                  disabled={!newExName.trim()}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >Create</button>
                <button
                  onClick={() => { setCreatingForIdx(null); setNewExName(''); setNewExMuscle('') }}
                  className="text-gray-400 hover:text-gray-600 px-2 text-sm"
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setCreatingForIdx(exIdx); setNewExName(''); setNewExMuscle('') }}
              className="text-xs text-gray-400 hover:text-blue-600 mb-3 pl-1"
            >+ Create new exercise</button>
          )}

          <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 px-1">
            <span className="text-xs text-gray-400 font-medium">Set</span>
            <span className="text-xs text-gray-400 font-medium">Reps</span>
            <span className="text-xs text-gray-400 font-medium">Weight (lbs)</span>
            <span />
          </div>
          {entry.sets.map((set, setIdx) => (
            <div key={setIdx} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 items-center">
              <span className="text-sm text-gray-500 font-medium pl-1">{setIdx + 1}</span>
              <input
                type="number" min="0" value={set.reps}
                onChange={(e) => updateSetField(exIdx, setIdx, 'reps', e.target.value)}
                placeholder="0"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number" min="0" step="2.5" value={set.weight}
                onChange={(e) => updateSetField(exIdx, setIdx, 'weight', e.target.value)}
                placeholder="0"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => removeSet(exIdx, setIdx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          ))}
          <button onClick={() => addSet(exIdx)} className="text-blue-600 text-sm hover:underline mt-1">
            + Add set
          </button>

          <input
            type="text"
            value={entry.notes}
            onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
            placeholder="Exercise notes..."
            className="mt-3 w-full text-xs border-0 border-b border-gray-200 focus:border-blue-400 bg-transparent py-1 focus:outline-none text-gray-600 placeholder-gray-300"
          />
        </div>
      ))}

      <button
        onClick={addExercise}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors mb-4"
      >
        + Add Exercise
      </button>

      <button
        onClick={save}
        disabled={saving || entries.length === 0}
        className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}
