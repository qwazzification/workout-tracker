'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Routine, Exercise } from '@/lib/types'
import { format } from 'date-fns'

// ── View types ────────────────────────────────────────────────────────────────

interface SetRow {
  id: string
  exercise_id: string
  set_number: number
  reps: number | null
  weight: number | null
  duration_seconds: number | null
  distance_miles: number | null
  exercise: { name: string } | null
}

interface ExerciseNote {
  exercise_id: string
  notes: string
  exercise: { name: string } | null
}

interface WorkoutDetail {
  id: string
  date: string
  name: string | null
  notes: string | null
  is_public: boolean
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  routine: { id: string; name: string } | null
  sets: SetRow[]
  workout_exercise_notes: ExerciseNote[]
}

// ── Edit types ────────────────────────────────────────────────────────────────

interface SetEntry {
  reps: string
  weight: string
  repsHint: string
  weightHint: string
  duration: string
  distance: string
  durationHint: string
  distanceHint: string
}

interface ExerciseEntry {
  exercise_id: string
  sets: SetEntry[]
  notes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

function fmtCardioDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${m}m`
}

function fmtPace(durationSeconds: number, distanceMiles: number): string {
  if (!distanceMiles) return '—'
  const paceS = durationSeconds / distanceMiles
  const m = Math.floor(paceS / 60)
  const s = Math.round(paceS % 60)
  return `${m}:${s.toString().padStart(2, '0')} /mi`
}

function parseDurationToSeconds(minutesStr: string): number | null {
  const val = parseFloat(minutesStr)
  if (isNaN(val) || val < 0) return null
  return Math.round(val * 60)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>('view')

  // View state
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null)

  // Edit state
  const [date, setDate] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routineId, setRoutineId] = useState('')
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(true)
  const [entries, setEntries] = useState<ExerciseEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [creatingForIdx, setCreatingForIdx] = useState<number | null>(null)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)

    const [
      { data: r },
      { data: e },
      { data: log },
      { data: setRows },
      { data: exNotes },
    ] = await Promise.all([
      supabase.from('routines').select('*').order('name'),
      supabase.from('exercises').select('*').order('name'),
      supabase
        .from('workout_logs')
        .select('id, date, name, notes, is_public, started_at, ended_at, duration_seconds, routine:routines(id, name)')
        .eq('id', id)
        .single(),
      supabase
        .from('sets')
        .select('id, exercise_id, set_number, reps, weight, duration_seconds, distance_miles, exercise:exercises(name)')
        .eq('workout_log_id', id)
        .order('set_number'),
      supabase
        .from('workout_exercise_notes')
        .select('exercise_id, notes, exercise:exercises(name)')
        .eq('workout_log_id', id),
    ])

    setRoutines(r || [])
    setExercises(e || [])

    if (!log) { setNotFound(true); setLoading(false); return }

    const rawSets = (setRows || []) as unknown as SetRow[]
    const rawNotes = (exNotes || []) as unknown as ExerciseNote[]

    const routineVal = log.routine as unknown as { id: string; name: string } | null
    setWorkout({
      ...log,
      routine: routineVal,
      sets: rawSets,
      workout_exercise_notes: rawNotes,
    } as WorkoutDetail)

    // Prep edit state — existing values become ghost hints so user can type over them
    setDate(log.date)
    setRoutineId(routineVal?.id ?? '')
    setEditName((log as unknown as { name: string | null }).name ?? '')
    setEditNotes(log.notes ?? '')
    setEditIsPublic((log as unknown as { is_public: boolean }).is_public ?? true)

    const notesMap = new Map(rawNotes.map((n) => [n.exercise_id, n.notes]))
    const exerciseMap = new Map<string, SetEntry[]>()
    const exerciseOrder: string[] = []

    rawSets.forEach((s) => {
      if (!exerciseMap.has(s.exercise_id)) {
        exerciseMap.set(s.exercise_id, [])
        exerciseOrder.push(s.exercise_id)
      }
      exerciseMap.get(s.exercise_id)!.push({
        reps: '',
        weight: '',
        repsHint: s.reps?.toString() ?? '',
        weightHint: s.weight?.toString() ?? '',
        duration: '',
        distance: '',
        durationHint: s.duration_seconds != null ? (s.duration_seconds / 60).toString() : '',
        distanceHint: s.distance_miles?.toString() ?? '',
      })
    })

    setEntries(
      exerciseOrder.map((exId) => ({
        exercise_id: exId,
        sets: exerciseMap.get(exId)!,
        notes: notesMap.get(exId) ?? '',
      }))
    )

    setLoading(false)
  }

  // ── Edit helpers ─────────────────────────────────────────────────────────────

  const blankSet: SetEntry = { reps: '', weight: '', repsHint: '', weightHint: '', duration: '', distance: '', durationHint: '', distanceHint: '' }

  function addExercise() {
    setEntries((prev) => [
      ...prev,
      { exercise_id: '', sets: [blankSet], notes: '' },
    ])
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
            duration: '',
            distance: '',
            durationHint: last?.durationHint || last?.duration || '',
            distanceHint: last?.distanceHint || last?.distance || '',
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

  function updateSetField(exIdx: number, setIdx: number, field: 'reps' | 'weight' | 'duration' | 'distance', value: string) {
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

  function isCardioExercise(exerciseId: string): boolean {
    return exercises.find((e) => e.id === exerciseId)?.muscle_group?.trim().toLowerCase() === 'cardio'
  }

  async function saveEdits() {
    if (entries.length === 0) return alert('Add at least one exercise.')
    if (entries.some((e) => !e.exercise_id)) return alert('Select an exercise for each entry.')
    setSaving(true)

    const { error: logError } = await supabase
      .from('workout_logs')
      .update({ date, name: editName.trim() || null, routine_id: routineId || null, notes: editNotes.trim() || null, is_public: editIsPublic })
      .eq('id', id)

    if (logError) { alert('Error: ' + logError.message); setSaving(false); return }

    await Promise.all([
      supabase.from('sets').delete().eq('workout_log_id', id),
      supabase.from('workout_exercise_notes').delete().eq('workout_log_id', id),
    ])

    const setsToInsert = entries.flatMap((entry) => {
      const cardio = isCardioExercise(entry.exercise_id)
      return entry.sets.map((set, setIdx) => ({
        workout_log_id: id,
        exercise_id: entry.exercise_id,
        set_number: setIdx + 1,
        reps: cardio ? null : (set.reps !== '' ? parseInt(set.reps) : (set.repsHint !== '' ? parseInt(set.repsHint) : null)),
        weight: cardio ? null : (set.weight !== '' ? parseFloat(set.weight) : (set.weightHint !== '' ? parseFloat(set.weightHint) : null)),
        duration_seconds: cardio ? parseDurationToSeconds(set.duration !== '' ? set.duration : set.durationHint) : null,
        distance_miles: cardio ? (parseFloat(set.distance !== '' ? set.distance : set.distanceHint) || null) : null,
      }))
    })

    const { error: setsError } = await supabase.from('sets').insert(setsToInsert)
    if (setsError) { alert('Error saving sets: ' + setsError.message); setSaving(false); return }

    const notesToInsert = entries
      .filter((e) => e.notes.trim())
      .map((e) => ({ workout_log_id: id, exercise_id: e.exercise_id, notes: e.notes.trim() }))

    if (notesToInsert.length > 0) {
      await supabase.from('workout_exercise_notes').insert(notesToInsert)
    }

    setSaving(false)
    await loadData()
    setMode('view')
  }

  async function togglePublic() {
    if (!workout) return
    const next = !workout.is_public
    await supabase.from('workout_logs').update({ is_public: next }).eq('id', id)
    setWorkout((prev) => prev ? { ...prev, is_public: next } : null)
  }

  async function deleteWorkout() {
    if (!confirm('Delete this workout? This cannot be undone.')) return
    await supabase.from('workout_logs').delete().eq('id', id)
    router.back();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
  if (notFound || !workout) return (
    <div className="text-center py-16">
      <p className="text-gray-400 dark:text-gray-500 mb-4">Workout not found.</p>
      <button onClick={() => router.back()} className="text-brand-600 hover:underline text-sm">← Back</button>
    </div>
  )

  // Group sets by exercise name (for view mode)
  const byExercise: Record<string, SetRow[]> = {}
  workout.sets.forEach((s) => {
    const name = s.exercise?.name ?? 'Unknown'
    if (!byExercise[name]) byExercise[name] = []
    byExercise[name].push(s)
  })

  const exNotesByName: Record<string, string> = {}
  workout.workout_exercise_notes.forEach((n) => {
    exNotesByName[n.exercise?.name ?? 'Unknown'] = n.notes
  })

  const workoutDate = new Date(workout.date + 'T00:00:00')
  const routineName = workout.routine?.name ?? 'Workout'
  const displayName = workout.name ?? routineName

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="grid grid-cols-2 items-center w-full"> 
        {/* Left Side Container */}
        <div className="justify-self-start"> 
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 h-6 px-3 rounded-lg bg-gray-800 border border-gray-500 text-gray-400 dark:text-gray-500 hover:text-gray-300 text-xs shrink-0 transition-colors"
          >
            <span>←</span> Back
          </button>
        </div> 

        {/* Right Side Container */}
        <div className="w-full"> 
          {mode === 'view' ? (
            <div className="flex justify-end gap-2" >
              <button
                onClick={togglePublic}
                className={`flex items-center text-xs h-6 px-3 rounded-lg font-medium shrink-0 transition-colors ${
                  workout.is_public
                    ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {workout.is_public ? '🌐 Public' : '🔒 Private'}
              </button>
              <button
                onClick={() => setMode('edit')}
                className="flex items-center text-xs font-medium h-6 px-3 rounded-lg bg-brand-600 text-white hover:text-brand-400 shrink-0 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={deleteWorkout}
                className="flex items-center text-xs h-6 px-3 rounded-lg bg-red-800 text-white hover:text-red-400 whitespace-nowrap transition-colors"
              >
                Delete workout
              </button>
            </div> 
          ) : ( 
            <div className="flex justify-end">
              <button 
                onClick={() => { setMode('view'); loadData() }} 
                className="flex items-center text-sm h-10 px-4 rounded-lg border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-red-400 dark:text-red-500 shrink-0 transition-colors" 
              > 
                Cancel 
              </button> 
            </div>
          )} 
        </div> 
      </div>

      <h1 className="flex justify-start my-4 text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 truncate">
        {displayName}
      </h1>

      {/* ── VIEW MODE ── */}
      {mode === 'view' && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {format(workoutDate, 'EEEE, MMMM d, yyyy')}
                </div>
                {workout.duration_seconds != null && workout.duration_seconds > 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDuration(workout.duration_seconds)}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {Object.keys(byExercise).length} exercise{Object.keys(byExercise).length !== 1 ? 's' : ''}
              </div>
            </div>
            {workout.notes && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 italic">{`"${workout.notes}"`}</p>
            )}
          </div>

          <div className="space-y-3 mb-6">
            {Object.entries(byExercise).map(([name, sets]) => {
              const exId = sets[0]?.exercise_id
              const cardio = isCardioExercise(exId)
              return (
                <div
                  key={name}
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
                >
                  <Link
                    href={`/exercises/${exId}`}
                    className="font-semibold text-gray-900 dark:text-white text-sm mb-2 dark:underline dark:underline-offset-2"
                  >
                    {name}
                  </Link>
                  {exNotesByName[name] && (
                    <p className="text-sm text-gray-400 dark:text-gray-200 italic mt-1">{exNotesByName[name]}</p>
                  )}
                  {cardio ? (
                    <>
                      <div className="grid grid-cols-3 text-xs text-gray-400 dark:text-gray-300 font-medium mt-2 mb-1 px-0.5">
                        <span>Set</span><span>Duration</span><span>Distance · Pace</span>
                      </div>
                      {sets.sort((a, b) => a.set_number - b.set_number).map((s) => (
                        <div key={s.id} className="grid grid-cols-3 text-sm text-gray-700 dark:text-gray-300 py-0.5 px-0.5">
                          <span>{s.set_number}</span>
                          <span>{s.duration_seconds != null ? fmtCardioDuration(s.duration_seconds) : '—'}</span>
                          <span>
                            {s.distance_miles != null ? `${s.distance_miles} mi` : '—'}
                            {s.duration_seconds != null && s.distance_miles != null && (
                              <span className="text-gray-400 dark:text-gray-500 text-xs ml-1.5">
                                {fmtPace(s.duration_seconds, s.distance_miles)}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 text-xs text-gray-400 dark:text-gray-300 font-medium mt-2 mb-1 px-0.5">
                        <span>Set</span><span>Reps</span><span>Weight</span>
                      </div>
                      {sets.sort((a, b) => a.set_number - b.set_number).map((s) => (
                        <div key={s.id} className="grid grid-cols-3 text-sm text-gray-700 dark:text-gray-300 py-0.5 px-0.5">
                          <span>{s.set_number}</span>
                          <span>{s.reps ?? '—'}</span>
                          <span>{s.weight != null ? `${s.weight} lbs` : '—'}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          
        </>
      )}

      {/* ── EDIT MODE ── */}
      {mode === 'edit' && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Workout name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={routineName}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Leave blank to use the routine name</p>
            </div>
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
                onChange={(e) => setRoutineId(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No routine</option>
                {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Notes (optional)</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder="How did it go?"
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Visibility</span>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {editIsPublic ? 'Visible to friends in their feed' : 'Only visible to you'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditIsPublic((p) => !p)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                  editIsPublic
                    ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {editIsPublic ? '🌐 Public' : '🔒 Private'}
              </button>
            </div>
          </div>

          {entries.map((entry, exIdx) => (
            <div key={exIdx} className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border mb-4 transition-all duration-300 ${justMoved === exIdx ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-300 dark:ring-brand-600' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="flex gap-2 mb-1 items-center">
                <select
                  value={entry.exercise_id}
                  onChange={(e) => updateExerciseId(exIdx, e.target.value)}
                  className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select exercise...</option>
                  {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
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

              {isCardioExercise(entry.exercise_id) ? (
                <>
                  <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 px-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Set</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Duration (min)</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Distance (mi)</span>
                    <span />
                  </div>
                  {entry.sets.map((set, setIdx) => (
                    <div key={setIdx} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 items-center">
                      <span className="text-sm text-gray-500 dark:text-gray-400 font-medium pl-1">{setIdx + 1}</span>
                      <input type="number" inputMode="decimal" min="0" step="0.5"
                        value={set.duration}
                        onChange={(e) => updateSetField(exIdx, setIdx, 'duration', e.target.value)}
                        placeholder={set.durationHint || '0'}
                        className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      <input type="number" inputMode="decimal" min="0" step="0.1"
                        value={set.distance}
                        onChange={(e) => updateSetField(exIdx, setIdx, 'distance', e.target.value)}
                        placeholder={set.distanceHint || '0'}
                        className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      <button onClick={() => removeSet(exIdx, setIdx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 px-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Set</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Reps</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Weight (lbs)</span>
                    <span />
                  </div>
                  {entry.sets.map((set, setIdx) => (
                    <div key={setIdx} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-2 items-center">
                      <span className="text-sm text-gray-500 dark:text-gray-400 font-medium pl-1">{setIdx + 1}</span>
                      <input type="number" inputMode="numeric" min="0"
                        value={set.reps}
                        onChange={(e) => updateSetField(exIdx, setIdx, 'reps', e.target.value)}
                        placeholder={set.repsHint || '0'}
                        className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      <input type="number" inputMode="decimal" min="0" step="2.5"
                        value={set.weight}
                        onChange={(e) => updateSetField(exIdx, setIdx, 'weight', e.target.value)}
                        placeholder={set.weightHint || '0'}
                        className="min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      <button onClick={() => removeSet(exIdx, setIdx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                    </div>
                  ))}
                </>
              )}
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
            onClick={saveEdits}
            disabled={saving || entries.length === 0}
            className="w-full bg-brand-600 text-white rounded-xl py-3 font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-6"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      )}
    </div>
  )
}
