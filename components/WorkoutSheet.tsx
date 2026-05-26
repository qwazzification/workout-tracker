'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import { format } from 'date-fns'

interface LiveSet {
  dbId: string | null
  reps: string
  weight: string
  repsHint: string
  weightHint: string
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

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
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

  // Timer
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // Add-exercise controls
  const [addExId, setAddExId] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => {
    if (!workoutId) return
    loadWorkout()
  }, [workoutId])

  // Persist full exercise state to localStorage on every change so navigating
  // away and back never loses exercises or typed-but-unconfirmed values.
  useEffect(() => {
    if (!workoutId || loading) return
    localStorage.setItem(`workout-state-${workoutId}`, JSON.stringify(liveExercises))
  }, [liveExercises, workoutId, loading])

  useEffect(() => {
    if (!startedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

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

    // Start timer — persist across re-opens
    const timerKey = `workout-start-${workoutId}`
    let startStr = localStorage.getItem(timerKey)
    if (!startStr) {
      startStr = new Date().toISOString()
      localStorage.setItem(timerKey, startStr)
    }
    setStartedAt(new Date(startStr))

    // ── Restore from localStorage first ──────────────────────────────────────
    // This preserves all exercises (including those with unconfirmed sets) when
    // the user navigates away and comes back during an active workout.
    const savedState = localStorage.getItem(`workout-state-${workoutId}`)
    if (savedState) {
      try {
        setLiveExercises(JSON.parse(savedState))
        setLoading(false)
        return
      } catch {
        // Corrupt data — fall through to DB load
        localStorage.removeItem(`workout-state-${workoutId}`)
      }
    }

    // ── First load: build state from DB / routine template ───────────────────
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
      // Resume from a previous session that had completed sets in the DB
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
          repsHint: '',
          weightHint: '',
          completed: true,
        })
      })
      setLiveExercises(order.map((id) => exerciseMap[id]))
    } else if (log.routine_id) {
      // Fresh start from routine: pre-populate as ghost/placeholder values
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
            return {
              exerciseId: re.exercise_id,
              name: re.exercise?.name ?? 'Unknown',
              notes: '',
              sets: Array.from({ length: re.default_sets }, () => ({
                dbId: null,
                reps: '',
                weight: '',
                repsHint: (re.default_reps ?? last?.reps)?.toString() ?? '',
                weightHint: last?.weight?.toString() ?? '',
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
    const reps = set.reps !== '' ? parseInt(set.reps) : (set.repsHint !== '' ? parseInt(set.repsHint) : null)
    const weight = set.weight !== '' ? parseFloat(set.weight) : (set.weightHint !== '' ? parseFloat(set.weightHint) : null)

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
      prev.map((e, ei) => {
        if (ei !== exIdx) return e
        return {
          ...e,
          sets: e.sets.map((s, si) => {
            if (si === setIdx) return { ...s, [field]: value }
            // cascade to sibling set hints when a value is typed
            if (value !== '') return { ...s, [`${field}Hint`]: value }
            return s
          }),
        }
      })
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
          sets: [
            ...e.sets,
            {
              dbId: null,
              reps: '',
              weight: '',
              repsHint: last?.repsHint || last?.reps || '',
              weightHint: last?.weightHint || last?.weight || '',
              completed: false,
            },
          ],
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

  const [justMoved, setJustMoved] = useState<number | null>(null)

  function swapExercise(fromIdx: number, toIdx: number) {
    setLiveExercises((prev) => {
      if (toIdx < 0 || toIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
      return next
    })
    setJustMoved(toIdx)
    setTimeout(() => setJustMoved(null), 700)
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
      { exerciseId: ex.id, name: ex.name, notes: '', sets: [{ dbId: null, reps: '', weight: '', repsHint: '', weightHint: '', completed: false }] },
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
        { exerciseId: data.id, name: data.name, notes: '', sets: [{ dbId: null, reps: '', weight: '', repsHint: '', weightHint: '', completed: false }] },
      ])
      setCreatingNew(false)
      setNewExName('')
      setNewExMuscle('')
    }
  }

  async function finishWorkout() {
    // Save timing
    const endedAt = new Date()
    const timerKey = `workout-start-${workoutId}`
    const startStr = localStorage.getItem(timerKey)
    const timerStart = startStr ? new Date(startStr) : startedAt
    const durationSeconds = timerStart
      ? Math.floor((endedAt.getTime() - timerStart.getTime()) / 1000)
      : null
    await supabase.from('workout_logs').update({
      started_at: timerStart?.toISOString() ?? null,
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      is_public: true,
    }).eq('id', workoutId)

    // Flush any unsaved sets, using hint as fallback for untyped fields
    const inserts: PromiseLike<unknown>[] = []
    liveExercises.forEach((entry) => {
      entry.sets.forEach((set, setIdx) => {
        if (set.dbId !== null) return
        const reps = set.reps !== '' ? parseInt(set.reps) : (set.repsHint !== '' ? parseInt(set.repsHint) : null)
        const weight = set.weight !== '' ? parseFloat(set.weight) : (set.weightHint !== '' ? parseFloat(set.weightHint) : null)
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
    localStorage.removeItem(timerKey)
    localStorage.removeItem(`workout-state-${workoutId}`)
    onFinish()
  }

  async function handleDiscard() {
    if (!confirm('Discard this workout? All sets will be deleted.')) return
    localStorage.removeItem(`workout-start-${workoutId}`)
    localStorage.removeItem(`workout-state-${workoutId}`)
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
        <div className="flex-1 text-center">
          <div className="font-semibold text-gray-900 dark:text-white text-sm">
            {workoutDate
              ? format(new Date(workoutDate + 'T00:00:00'), 'EEE, MMM d')
              : 'Workout'}
          </div>
          {startedAt && (
            <div className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              {formatElapsed(elapsed)}
            </div>
          )}
        </div>
        <button
          onClick={handleDiscard}
          className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-700"
        >
          Discard
        </button>
        <button
          onClick={finishWorkout}
          className="bg-brand-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-brand-700"
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
          <div className="p-4 pb-32 space-y-4 max-w-2xl mx-auto">
            {/* Workout notes */}
            <textarea
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              onBlur={saveWorkoutNotes}
              rows={2}
              placeholder="Workout notes (optional)..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 bg-white dark:bg-gray-800"
            />

            {/* Exercise cards */}
            {liveExercises.map((entry, exIdx) => (
              <div
                key={`${entry.exerciseId}-${exIdx}`}
                className={`bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border transition-all duration-300 ${justMoved === exIdx ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-300 dark:ring-brand-600' : 'border-gray-100 dark:border-gray-700'}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex-1 font-semibold text-gray-900 dark:text-white text-sm">{entry.name}</span>
                  {liveExercises.length > 1 && (
                    <select
                      value={exIdx + 1}
                      onChange={(e) => swapExercise(exIdx, parseInt(e.target.value) - 1)}
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-1 w-12 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0"
                      title="Move to position"
                    >
                      {liveExercises.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                    </select>
                  )}
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="text-red-400 hover:text-red-600 text-xl leading-none shrink-0 px-1"
                  >×</button>
                </div>

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
                      inputMode="numeric"
                      min="0"
                      value={set.reps}
                      onChange={(e) => updateSetField(exIdx, setIdx, 'reps', e.target.value)}
                      placeholder={set.repsHint || '0'}
                      className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="2.5"
                      value={set.weight}
                      onChange={(e) => updateSetField(exIdx, setIdx, 'weight', e.target.value)}
                      placeholder={set.weightHint || '0'}
                      className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
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
                  className="text-brand-600 text-sm hover:underline mt-1"
                >
                  + Add set
                </button>

                <input
                  type="text"
                  value={entry.notes}
                  onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                  onBlur={() => saveExerciseNotes(exIdx)}
                  placeholder="Notes..."
                  className="mt-3 w-full text-xs border-0 border-b border-gray-200 dark:border-gray-700 focus:border-brand-400 bg-transparent py-1 focus:outline-none text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600"
                />
              </div>
            ))}

            {/* Add exercise */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 space-y-2">
              <select
                value={addExId}
                onChange={(e) => setAddExId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Add exercise...</option>
                {availableExercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
              {addExId && (
                <button
                  onClick={handleAddExercise}
                  className="w-full bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-brand-700"
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
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  <div className="flex gap-2">
                    <input
                      value={newExMuscle}
                      onChange={(e) => setNewExMuscle(e.target.value)}
                      placeholder="Muscle group (optional)"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    />
                    <button
                      onClick={handleCreateExercise}
                      disabled={!newExName.trim()}
                      className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
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
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-brand-600"
                >
                  + Create new exercise
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
