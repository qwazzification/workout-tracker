'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import { format } from 'date-fns'

interface LiveSet {
  dbId: string | null
  reps: string
  weight: string
  completed: boolean
}

interface LiveExercise {
  exerciseId: string
  name: string
  notes: string
  sets: LiveSet[]
}

interface Props {
  isOpen: boolean
  workoutId: string
  userId: string
  allExercises: Exercise[]
  onClose: () => void
  onFinish: () => void
  onDiscard: () => void
  onExerciseCreated: (ex: Exercise) => void
}

export default function WorkoutSheet({
  isOpen,
  workoutId,
  userId,
  allExercises,
  onClose,
  onFinish,
  onDiscard,
  onExerciseCreated,
}: Props) {
  const [liveExercises, setLiveExercises] = useState<LiveExercise[]>([])
  const [workoutDate, setWorkoutDate] = useState('')
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [loading, setLoading] = useState(true)

  // Add-exercise controls
  const [addExId, setAddExId] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => {
    if (!workoutId) return
    loadWorkout()
  }, [workoutId])

  async function loadWorkout() {
    setLoading(true)

    const { data: log } = await supabase
      .from('workout_logs')
      .select('date, notes, routine_id')
      .eq('id', workoutId)
      .single()

    if (!log) { setLoading(false); return }
    setWorkoutDate(log.date)
    setWorkoutNotes(log.notes ?? '')

    const [{ data: rawSets }, { data: rawNotes }] = await Promise.all([
      supabase
        .from('sets')
        .select('id, exercise_id, set_number, reps, weight, exercise:exercises(name)')
        .eq('workout_log_id', workoutId)
        .order('set_number'),
      supabase
        .from('workout_exercise_notes')
        .select('exercise_id, notes')
        .eq('workout_log_id', workoutId),
    ])

    const notesByExId: Record<string, string> = {}
    ;(rawNotes || []).forEach((n: { exercise_id: string; notes: string }) => {
      notesByExId[n.exercise_id] = n.notes
    })

    const sets = (rawSets || []) as unknown as {
      id: string
      exercise_id: string
      set_number: number
      reps: number | null
      weight: number | null
      exercise: { name: string } | null
    }[]

    if (sets.length > 0) {
      // Resume: rebuild from saved sets
      const exerciseMap: Record<string, LiveExercise> = {}
      const order: string[] = []
      sets.forEach((s) => {
        if (!exerciseMap[s.exercise_id]) {
          exerciseMap[s.exercise_id] = {
            exerciseId: s.exercise_id,
            name: s.exercise?.name ?? 'Unknown',
            notes: notesByExId[s.exercise_id] ?? '',
            sets: [],
          }
          order.push(s.exercise_id)
        }
        exerciseMap[s.exercise_id].sets.push({
          dbId: s.id,
          reps: s.reps?.toString() ?? '',
          weight: s.weight?.toString() ?? '',
          completed: true,
        })
      })
      setLiveExercises(order.map((id) => exerciseMap[id]))
    } else if (log.routine_id) {
      // Fresh start from routine: pre-populate template
      const { data: routineEx } = await supabase
        .from('routine_exercises')
        .select('exercise_id, default_sets, default_reps, exercise:exercises(name)')
        .eq('routine_id', log.routine_id)
        .order('sort_order')

      const rex = (routineEx || []) as unknown as {
        exercise_id: string
        default_sets: number
        default_reps: number | null
        exercise: { name: string } | null
      }[]

      if (rex.length > 0) {
        const lastSets = await Promise.all(
          rex.map((re) =>
            supabase
              .from('sets')
              .select('reps, weight')
              .eq('exercise_id', re.exercise_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        )

        setLiveExercises(
          rex.map((re, i) => {
            const last = lastSets[i].data
            const reps = (re.default_reps ?? last?.reps)?.toString() ?? ''
            const weight = last?.weight?.toString() ?? ''
            return {
              exerciseId: re.exercise_id,
              name: re.exercise?.name ?? 'Unknown',
              notes: '',
              sets: Array.from({ length: re.default_sets }, () => ({
                dbId: null,
                reps,
                weight,
                completed: false,
              })),
            }
          })
        )
      }
    }

    setLoading(false)
  }

  async function saveSet(exIdx: number, setIdx: number) {
    const entry = liveExercises[exIdx]
    const set = entry.sets[setIdx]
    const reps = set.reps !== '' ? parseInt(set.reps) : null
    const weight = set.weight !== '' ? parseFloat(set.weight) : null

    if (set.dbId) {
      await supabase.from('sets').update({ reps, weight }).eq('id', set.dbId)
    } else {
      const { data } = await supabase
        .from('sets')
        .insert({
          workout_log_id: workoutId,
          exercise_id: entry.exerciseId,
          set_number: setIdx + 1,
          reps,
          weight,
        })
        .select('id')
        .single()
      if (data) {
        setLiveExercises((prev) =>
          prev.map((e, ei) =>
            ei !== exIdx
              ? e
              : {
                  ...e,
                  sets: e.sets.map((s, si) =>
                    si !== setIdx ? s : { ...s, dbId: data.id }
                  ),
                }
          )
        )
      }
    }
  }

  function updateSetField(exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string) {
    setLiveExercises((prev) =>
      prev.map((e, ei) =>
        ei !== exIdx
          ? e
          : { ...e, sets: e.sets.map((s, si) => (si !== setIdx ? s : { ...s, [field]: value })) }
      )
    )
  }

function toggleComplete(exIdx: number, setIdx: number) {
  setLiveExercises((prev) =>
    prev.map((e, ei) =>
      ei !== exIdx
        ? e
        : { ...e, sets: e.sets.map((s, si) =>
            si !== setIdx ? s : { ...s, completed: !s.completed }
          )}
    )
  )
  // Also save the set to DB immediately when checked
  if (!liveExercises[exIdx].sets[setIdx].completed) {
    saveSet(exIdx, setIdx)
  }
}

  function addSet(exIdx: number) {
    setLiveExercises((prev) =>
      prev.map((e, ei) => {
        if (ei !== exIdx) return e
        const last = e.sets[e.sets.length - 1]
        return {
          ...e,
          sets: [...e.sets, { dbId: null, reps: last?.reps ?? '', weight: last?.weight ?? '', completed: false }],
        }
      })
    )
  }

  async function removeSet(exIdx: number, setIdx: number) {
    const set = liveExercises[exIdx].sets[setIdx]
    if (set.dbId) {
      await supabase.from('sets').delete().eq('id', set.dbId)
    }
    setLiveExercises((prev) =>
      prev.map((e, ei) =>
        ei !== exIdx ? e : { ...e, sets: e.sets.filter((_, si) => si !== setIdx) }
      )
    )
  }

  async function removeExercise(exIdx: number) {
    const entry = liveExercises[exIdx]
    const dbIds = entry.sets.filter((s) => s.dbId).map((s) => s.dbId as string)
    if (dbIds.length > 0) await supabase.from('sets').delete().in('id', dbIds)
    await supabase
      .from('workout_exercise_notes')
      .delete()
      .eq('workout_log_id', workoutId)
      .eq('exercise_id', entry.exerciseId)
    setLiveExercises((prev) => prev.filter((_, i) => i !== exIdx))
  }

  function moveExercise(exIdx: number, dir: 'up' | 'down') {
    setLiveExercises((prev) => {
      const next = [...prev]
      const swap = dir === 'up' ? exIdx - 1 : exIdx + 1
      if (swap < 0 || swap >= next.length) return prev
      ;[next[exIdx], next[swap]] = [next[swap], next[exIdx]]
      return next
    })
  }

  function updateExerciseNotes(exIdx: number, value: string) {
    setLiveExercises((prev) =>
      prev.map((e, ei) => (ei !== exIdx ? e : { ...e, notes: value }))
    )
  }

  async function saveExerciseNotes(exIdx: number) {
    const entry = liveExercises[exIdx]
    const notes = entry.notes.trim()
    await supabase
      .from('workout_exercise_notes')
      .delete()
      .eq('workout_log_id', workoutId)
      .eq('exercise_id', entry.exerciseId)
    if (notes) {
      await supabase.from('workout_exercise_notes').insert({
        workout_log_id: workoutId,
        exercise_id: entry.exerciseId,
        notes,
      })
    }
  }

  async function saveWorkoutNotes() {
    await supabase
      .from('workout_logs')
      .update({ notes: workoutNotes.trim() || null })
      .eq('id', workoutId)
  }

  function handleAddExercise() {
    if (!addExId) return
    const ex = allExercises.find((e) => e.id === addExId)
    if (!ex) return
    setLiveExercises((prev) => [
      ...prev,
      { exerciseId: ex.id, name: ex.name, notes: '', sets: [{ dbId: null, reps: '', weight: '', completed: false }] },
    ])
    setAddExId('')
  }

  async function handleCreateExercise() {
    const name = newExName.trim()
    if (!name) return
    const { data } = await supabase
      .from('exercises')
      .insert({ name, muscle_group: newExMuscle.trim() || null, user_id: userId })
      .select()
      .single()
    if (data) {
      onExerciseCreated(data as Exercise)
      setLiveExercises((prev) => [
        ...prev,
        { exerciseId: data.id, name: data.name, notes: '', sets: [{ dbId: null, reps: '', weight: '', completed: false }] },
      ])
      setCreatingNew(false)
      setNewExName('')
      setNewExMuscle('')
    }
  }

  async function finishWorkout() {
    // Flush any unsaved sets to DB
    const inserts: PromiseLike<unknown>[] = []
    liveExercises.forEach((entry) => {
      entry.sets.forEach((set, setIdx) => {
        if (set.dbId !== null) return
        const reps = set.reps !== '' ? parseInt(set.reps) : null
        const weight = set.weight !== '' ? parseFloat(set.weight) : null
        if (reps === null && weight === null) return
        inserts.push(
          supabase.from('sets').insert({
            workout_log_id: workoutId,
            exercise_id: entry.exerciseId,
            set_number: setIdx + 1,
            reps,
            weight,
          })
        )
      })
    })
    await Promise.all(inserts)
    onFinish()
  }

  async function handleDiscard() {
    if (!confirm('Discard this workout? All sets will be deleted.')) return
    onDiscard()
  }

  const usedIds = new Set(liveExercises.map((e) => e.exerciseId))
  const availableExercises = allExercises.filter((e) => !usedIds.has(e.id))

  return (
    <div
      className={`fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col transform transition-transform duration-300 ease-out ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900 safe-area-inset-top">
        <button
          onClick={onClose}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium px-1"
        >
          ← Back
        </button>
        <div className="flex-1 text-center font-semibold text-gray-900 dark:text-white text-sm">
          {workoutDate
            ? format(new Date(workoutDate + 'T00:00:00'), 'EEE, MMM d')
            : 'Workout'}
        </div>
        <button
          onClick={finishWorkout}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          Finish
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">
            Loading...
          </div>
        ) : (
          <div className="p-4 pb-32 space-y-4">
            {/* Workout notes */}
            <textarea
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              onBlur={saveWorkoutNotes}
              rows={2}
              placeholder="Workout notes (optional)..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 bg-white dark:bg-gray-800"
            />

            {/* Exercise cards */}
            {liveExercises.map((entry, exIdx) => (
              <div
                key={`${entry.exerciseId}-${exIdx}`}
                className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700"
              >
                {/* Header row */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex-1 font-semibold text-gray-900 dark:text-white text-sm">{entry.name}</span>
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => moveExercise(exIdx, 'up')}
                      disabled={exIdx === 0}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 text-xs leading-none py-0.5 px-1"
                    >▲</button>
                    <button
                      onClick={() => moveExercise(exIdx, 'down')}
                      disabled={exIdx === liveExercises.length - 1}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 text-xs leading-none py-0.5 px-1"
                    >▼</button>
                  </div>
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="text-red-400 hover:text-red-600 text-xl leading-none shrink-0 px-1"
                  >×</button>
                </div>

                {/* Set rows */}
                <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem_2rem] gap-2 mb-2 px-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Set</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Reps</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">lbs</span>
                  <span />
                  <span />
                </div>
                {entry.sets.map((set, setIdx) => (
                  <div
                    key={setIdx}
                    className="grid grid-cols-[2rem_1fr_1fr_2.5rem_2rem] gap-2 mb-2 items-center"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-medium pl-1">{setIdx + 1}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={set.reps}
                      onChange={(e) => updateSetField(exIdx, setIdx, 'reps', e.target.value)}
                      onBlur={() => saveSet(exIdx, setIdx)}
                      placeholder="0"
                      className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="2.5"
                      value={set.weight}
                      onChange={(e) => updateSetField(exIdx, setIdx, 'weight', e.target.value)}
                      onBlur={() => saveSet(exIdx, setIdx)}
                      placeholder="0"
                      className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={() => toggleComplete(exIdx, setIdx)}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors ${
                        set.completed
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-green-400'
                      }`}
                    >✓</button>
                    <button
                      onClick={() => removeSet(exIdx, setIdx)}
                      className="text-red-400 hover:text-red-600 text-xl leading-none"
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => addSet(exIdx)}
                  className="text-blue-600 text-sm hover:underline mt-1"
                >
                  + Add set
                </button>

                {/* Exercise notes */}
                <input
                  type="text"
                  value={entry.notes}
                  onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                  onBlur={() => saveExerciseNotes(exIdx)}
                  placeholder="Notes..."
                  className="mt-3 w-full text-xs border-0 border-b border-gray-200 dark:border-gray-700 focus:border-blue-400 bg-transparent py-1 focus:outline-none text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600"
                />
              </div>
            ))}

            {/* Add exercise */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 space-y-2">
              <select
                value={addExId}
                onChange={(e) => setAddExId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Add exercise...</option>
                {availableExercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
              {addExId && (
                <button
                  onClick={handleAddExercise}
                  className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700"
                >
                  Add to workout
                </button>
              )}

              {creatingNew ? (
                <div className="space-y-2 pt-1">
                  <input
                    autoFocus
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                    placeholder="Exercise name"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  <div className="flex gap-2">
                    <input
                      value={newExMuscle}
                      onChange={(e) => setNewExMuscle(e.target.value)}
                      placeholder="Muscle group (optional)"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                    <button
                      onClick={handleCreateExercise}
                      disabled={!newExName.trim()}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => { setCreatingNew(false); setNewExName(''); setNewExMuscle('') }}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingNew(true)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600"
                >
                  + Create new exercise
                </button>
              )}
            </div>

            {/* Discard */}
            <div className="pt-2 text-center">
              <button
                onClick={handleDiscard}
                className="text-sm text-red-400 hover:text-red-600"
              >
                Discard workout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
