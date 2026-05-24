'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Routine, Exercise } from '@/lib/types'

interface SetEntry {
  reps: string
  weight: string
  repsHint: string
  weightHint: string
}

interface ExerciseEntry {
  exercise_id: string
  sets: SetEntry[]
  notes: string
}

interface TemplateEntry {
  exercise_id: string
  default_sets: number
  default_reps: number | null
}

export default function LogWorkout() {
  const router = useRouter()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routineId, setRoutineId] = useState('')
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState<ExerciseEntry[]>([])
  const [template, setTemplate] = useState<TemplateEntry[]>([])
  const [saving, setSaving] = useState(false)

  const [creatingForIdx, setCreatingForIdx] = useState<number | null>(null)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: e }] = await Promise.all([
        supabase.from('routines').select('*').order('name'),
        supabase.from('exercises').select('*').order('name'),
      ])
      setRoutines(r || [])
      setExercises(e || [])
    }
    load()
  }, [])

  async function onRoutineChange(id: string) {
    setRoutineId(id)
    if (!id) { setTemplate([]); return }
    const { data } = await supabase
      .from('routine_exercises')
      .select('exercise_id, default_sets, default_reps')
      .eq('routine_id', id)
      .order('sort_order')
    setTemplate((data as unknown as TemplateEntry[]) || [])
  }

  async function applyTemplate(tmpl: TemplateEntry[]) {
    const lastSets = await Promise.all(
      tmpl.map((t) =>
        supabase
          .from('sets')
          .select('reps, weight')
          .eq('exercise_id', t.exercise_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    )

    setEntries(
      tmpl.map((t, i) => {
        const last = lastSets[i].data
        return {
          exercise_id: t.exercise_id,
          sets: Array.from({ length: t.default_sets }, () => ({
            reps: '',
            weight: '',
            repsHint: (t.default_reps ?? last?.reps)?.toString() ?? '',
            weightHint: last?.weight?.toString() ?? '',
          })),
          notes: '',
        }
      })
    )
  }

  function addExercise() {
    setEntries((prev) => [...prev, { exercise_id: '', sets: [{ reps: '', weight: '', repsHint: '', weightHint: '' }], notes: '' }])
  }

  function removeExercise(exIdx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== exIdx))
  }

  const [justMoved, setJustMoved] = useState<number | null>(null)

  function swapExercise(exIdx: number, targetIdx: number) {
    if (targetIdx === exIdx) return
    setEntries((prev) => {
      const next = [...prev]
      ;[next[exIdx], next[targetIdx]] = [next[targetIdx], next[exIdx]]
      return next
    })
    setJustMoved(targetIdx)
    setTimeout(() => setJustMoved(null), 700)
  }

  function addSet(exIdx: number) {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== exIdx) return entry
        const last = entry.sets[entry.sets.length - 1]
        return {
          ...entry,
          sets: [...entry.sets, {
            reps: '',
            weight: '',
            repsHint: last?.repsHint || last?.reps || '',
            weightHint: last?.weightHint || last?.weight || '',
          }],
        }
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
        return {
          ...entry,
          sets: entry.sets.map((s, j) => {
            if (j === setIdx) return { ...s, [field]: value }
            if (value !== '') return { ...s, [`${field}Hint`]: value }
            return s
          }),
        }
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
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExMuscle.trim() || null, user_id: user!.id })
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

    const { data: { user } } = await supabase.auth.getUser()
    const { data: log, error: logError } = await supabase
      .from('workout_logs')
      .insert({ date, routine_id: routineId || null, notes: notes.trim() || null, user_id: user!.id })
      .select()
      .single()

    if (logError || !log) {
      alert('Error saving workout: ' + logError?.message)
      setSaving(false)
      return
    }

    const setsToInsert = entries.flatMap((entry) =>
      entry.sets.map((set, setIdx) => ({
        workout_log_id: log.id,
        exercise_id: entry.exercise_id,
        set_number: setIdx + 1,
        reps: set.reps !== '' ? parseInt(set.reps) : (set.repsHint !== '' ? parseInt(set.repsHint) : null),
        weight: set.weight !== '' ? parseFloat(set.weight) : (set.weightHint !== '' ? parseFloat(set.weightHint) : null),
      }))
    )

    const { error: setsError } = await supabase.from('sets').insert(setsToInsert)
    if (setsError) {
      alert('Error saving sets: ' + setsError.message)
      setSaving(false)
      return
    }

    const notesToInsert = entries
      .filter((e) => e.notes.trim())
      .map((e) => ({ workout_log_id: log.id, exercise_id: e.exercise_id, notes: e.notes.trim() }))

    if (notesToInsert.length > 0) {
      await supabase.from('workout_exercise_notes').insert(notesToInsert)
    }

    router.push('/workouts/' + log.id)
  }

  const selectedRoutineName = routines.find((r) => r.id === routineId)?.name

  return (
    <div className="max-w-2xl mx-auto">
      <div className="grid grid-cols-2 items-center w-full">
        <div className="justify-self-start">
          <Link
            href="/workout"
            className="flex items-center gap-2 h-6 px-3 rounded-lg bg-gray-800 border border-gray-500 text-gray-400 dark:text-gray-500 hover:text-gray-300 text-xs shrink-0 transition-colors"
          >
            <span>←</span> Workout
          </Link>
        </div>
        <div className="w-full">
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving || entries.length === 0}
              className="flex items-center h-6 px-3 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save Workout'}
            </button>
          </div>
        </div>
      </div>

      <h1 className="flex justify-start my-4 text-xl font-bold text-gray-900 dark:text-white">
        Log Workout
      </h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Routine (optional)</label>
          <select
            value={routineId}
            onChange={(e) => onRoutineChange(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">No routine</option>
            {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {template.length > 0 && (
            <button
              onClick={() => applyTemplate(template)}
              className="mt-2 text-sm text-brand-600 hover:underline"
            >
              Load {selectedRoutineName} template
            </button>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="How did it go?"
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
      </div>

      {entries.map((entry, exIdx) => (
        <div key={exIdx} className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border mb-4 transition-all duration-300 ${justMoved === exIdx ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-300 dark:ring-brand-600' : 'border-gray-100 dark:border-gray-700'}`}>
          <div className="flex gap-2 mb-1 items-center">
            {entries.length > 1 && (
              <select
                value={exIdx + 1}
                onChange={(e) => swapExercise(exIdx, parseInt(e.target.value) - 1)}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-1 w-12 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0"
                title="Move to position"
              >
                {entries.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            )}
            <select
              value={entry.exercise_id}
              onChange={(e) => updateExerciseId(exIdx, e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select exercise...</option>
              {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
            <button
              onClick={() => removeExercise(exIdx)}
              className="text-red-400 hover:text-red-600 px-2 text-lg leading-none shrink-0"
            >×</button>
          </div>

          {creatingForIdx === exIdx ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3 space-y-2">
              <input
                autoFocus
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                placeholder="Exercise name"
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <div className="flex gap-2">
                <input
                  value={newExMuscle}
                  onChange={(e) => setNewExMuscle(e.target.value)}
                  placeholder="Muscle group (optional)"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={() => createExercise(exIdx)}
                  disabled={!newExName.trim()}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >Create</button>
                <button
                  onClick={() => { setCreatingForIdx(null); setNewExName(''); setNewExMuscle('') }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 px-2 text-sm"
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setCreatingForIdx(exIdx); setNewExName(''); setNewExMuscle('') }}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-brand-600 mb-3 pl-1"
            >+ Create new exercise</button>
          )}

          <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 px-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Set</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Reps</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Weight (lbs)</span>
            <span />
          </div>
          {entry.sets.map((set, setIdx) => (
            <div key={setIdx} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium pl-1">{setIdx + 1}</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={set.reps}
                onChange={(e) => updateSetField(exIdx, setIdx, 'reps', e.target.value)}
                placeholder={set.repsHint || '0'}
                className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="2.5"
                value={set.weight}
                onChange={(e) => updateSetField(exIdx, setIdx, 'weight', e.target.value)}
                placeholder={set.weightHint || '0'}
                className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
              <button
                onClick={() => removeSet(exIdx, setIdx)}
                className="text-red-400 hover:text-red-600 text-lg leading-none"
              >×</button>
            </div>
          ))}
          <button onClick={() => addSet(exIdx)} className="text-brand-600 text-sm hover:underline mt-1">
            + Add set
          </button>

          <input
            type="text"
            value={entry.notes}
            onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
            placeholder="Exercise notes..."
            className="mt-3 w-full text-xs border-0 border-b border-gray-200 dark:border-gray-700 focus:border-brand-400 bg-transparent py-1 focus:outline-none text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600"
          />
        </div>
      ))}

      <button
        onClick={addExercise}
        className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors mb-4"
      >
        + Add Exercise
      </button>

      <button
        onClick={save}
        disabled={saving || entries.length === 0}
        className="w-full bg-brand-600 text-white rounded-xl py-3 font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Saving...' : 'Save Workout'}
      </button>
    </div>
  )
}
