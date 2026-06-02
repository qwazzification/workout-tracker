'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import { format } from 'date-fns'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import MuscleProgressChart, { MuscleSetEntry } from '@/components/MuscleProgressChart'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoutineExerciseEntry {
  exercise_id: string
  default_sets: string
  default_reps: string
}

interface RoutineExerciseView {
  id: string
  default_sets: number
  default_reps: number | null
  exercise: { id: string; name: string; muscle_group: string | null }
}

interface WorkoutLogSummary {
  id: string
  date: string
  name: string | null
  setCount: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoutinePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'

  const [mode, setMode] = useState<'view' | 'edit'>(isNew ? 'edit' : 'view')
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [userId, setUserId] = useState('')

  // View data
  const [routineName, setRoutineName] = useState('')
  const [routineExercises, setRoutineExercises] = useState<RoutineExerciseView[]>([])
  const [history, setHistory] = useState<WorkoutLogSummary[]>([])
  const [radarSets, setRadarSets] = useState<{ muscle: string; weight: number; reps: number; date: string }[]>([])
  const [radarView, setRadarView] = useState<'radar' | 'trend'>('radar')

  // Edit data
  const [name, setName] = useState('')
  const [entries, setEntries] = useState<RoutineExerciseEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [justMoved, setJustMoved] = useState<number | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const [{ data: { user } }, { data: e }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('exercises').select('*').order('name'),
    ])
    setUserId(user?.id ?? '')
    setExercises(e || [])

    if (isNew) return

    const [{ data: routine }, { data: re }] = await Promise.all([
      supabase.from('routines').select('id, name').eq('id', id).single(),
      supabase
        .from('routine_exercises')
        .select('id, default_sets, default_reps, exercise:exercises(id, name, muscle_group)')
        .eq('routine_id', id)
        .order('sort_order'),
    ])

    if (!routine) { setNotFound(true); setLoading(false); return }

    const reRows = (re || []) as unknown as RoutineExerciseView[]
    setRoutineName(routine.name)
    setName(routine.name)
    setRoutineExercises(reRows)
    setEntries(reRows.map((row) => ({
      exercise_id: row.exercise.id,
      default_sets: row.default_sets.toString(),
      default_reps: row.default_reps?.toString() ?? '',
    })))

    // Workout history
    const { data: logs } = await supabase
      .from('workout_logs')
      .select('id, date, name, sets(id)')
      .eq('routine_id', id)
      .order('date', { ascending: false })

    type LogRow = { id: string; date: string; name: string | null; sets: { id: string }[] }
    const logRows = (logs || []) as unknown as LogRow[]
    setHistory(logRows.map((l) => ({ id: l.id, date: l.date, name: l.name, setCount: l.sets.length })))

    // Sets for radar chart
    if (logRows.length > 0) {
      const logIds = logRows.map((l) => l.id)
      const { data: sets } = await supabase
        .from('sets')
        .select('weight, reps, exercise:exercises(muscle_group), workout_log:workout_logs(date)')
        .in('workout_log_id', logIds)
      type SetRow = {
        weight: number | null
        reps: number | null
        exercise: { muscle_group: string | null } | null
        workout_log: { date: string } | null
      }
      setRadarSets(
        ((sets || []) as unknown as SetRow[]).map((s) => ({
          muscle: s.exercise?.muscle_group ?? 'Other',
          weight: s.weight ?? 0,
          reps: s.reps ?? 1,
          date: s.workout_log?.date ?? '',
        }))
      )
    }

    setLoading(false)
  }

  // Stable alphabetical radar
  const radarData = useMemo(() => {
    const allMuscles = new Set<string>()
    radarSets.forEach((s) => { if (s.muscle.toLowerCase() !== 'cardio') allMuscles.add(s.muscle) })
    const byMuscle: Record<string, { sets: number }> = {}
    radarSets.forEach((s) => {
      if (s.muscle.toLowerCase() === 'cardio') return
      if (!byMuscle[s.muscle]) byMuscle[s.muscle] = { sets: 0 }
      byMuscle[s.muscle].sets++
    })
    return Array.from(allMuscles)
      .sort((a, b) => a.localeCompare(b))
      .map((m) => ({ subject: m, sets: byMuscle[m]?.sets ?? 0 }))
  }, [radarSets])

  const trendEntries = useMemo<MuscleSetEntry[]>(() => {
    return radarSets
      .filter((s) => s.date && s.muscle.toLowerCase() !== 'cardio')
      .map((s) => ({ muscle: s.muscle, date: s.date, volume: s.weight * s.reps }))
  }, [radarSets])

  // ── Edit helpers ─────────────────────────────────────────────────────────────

  function cancelEdit() {
    setName(routineName)
    setEntries(routineExercises.map((row) => ({
      exercise_id: row.exercise.id,
      default_sets: row.default_sets.toString(),
      default_reps: row.default_reps?.toString() ?? '',
    })))
    setMode('view')
  }

  function addExercise() {
    setEntries((prev) => [...prev, { exercise_id: '', default_sets: '3', default_reps: '' }])
  }

  function removeExercise(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  function swapExercise(fromIdx: number, toIdx: number) {
    setEntries((prev) => {
      if (toIdx < 0 || toIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
      return next
    })
    setJustMoved(toIdx)
    setTimeout(() => setJustMoved(null), 700)
  }

  function updateEntry(idx: number, field: keyof RoutineExerciseEntry, value: string) {
    setEntries((prev) => prev.map((e, i) => (i !== idx ? e : { ...e, [field]: value })))
  }

  async function createExercise() {
    const exName = newExName.trim()
    if (!exName) return
    const { data } = await supabase
      .from('exercises')
      .insert({ name: exName, muscle_group: newExMuscle.trim() || null, user_id: userId })
      .select()
      .single()
    if (data) {
      setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setEntries((prev) => [...prev, { exercise_id: data.id, default_sets: '3', default_reps: '' }])
      setCreatingNew(false)
      setNewExName('')
      setNewExMuscle('')
    }
  }

  async function save() {
    const trimmedName = name.trim()
    if (!trimmedName) return alert('Give your routine a name.')
    if (entries.length === 0) return alert('Add at least one exercise.')
    if (entries.some((e) => !e.exercise_id)) return alert('Select an exercise for each row.')
    setSaving(true)

    let routineId = id

    if (isNew) {
      const { data, error } = await supabase
        .from('routines')
        .insert({ name: trimmedName, user_id: userId })
        .select()
        .single()
      if (error || !data) { alert('Error: ' + error?.message); setSaving(false); return }
      routineId = data.id
    } else {
      const { error } = await supabase.from('routines').update({ name: trimmedName }).eq('id', id)
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      await supabase.from('routine_exercises').delete().eq('routine_id', id)
    }

    const { error: reError } = await supabase.from('routine_exercises').insert(
      entries.map((e, i) => ({
        routine_id: routineId,
        exercise_id: e.exercise_id,
        default_sets: Math.max(1, parseInt(e.default_sets) || 3),
        default_reps: e.default_reps !== '' ? parseInt(e.default_reps) : null,
        sort_order: i,
      }))
    )
    if (reError) { alert('Error saving exercises: ' + reError.message); setSaving(false); return }

    if (isNew) {
      router.push('/workout')
    } else {
      setSaving(false)
      await loadData()
      setMode('view')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
  if (notFound) return (
    <div className="text-center py-16">
      <p className="text-gray-400 dark:text-gray-500 mb-4">Routine not found.</p>
      <Link href="/workout" className="text-brand-600 hover:underline text-sm">← Back</Link>
    </div>
  )

  const usedIds = new Set(entries.map((e) => e.exercise_id))
  const timesCompleted = history.length
  const lastDone = history[0]?.date
    ? format(new Date(history[0].date + 'T00:00:00'), 'MMM d, yyyy')
    : null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="grid grid-cols-2 items-center w-full">
        <div className="justify-self-start">
          <button
            onClick={() => (mode === 'edit' && !isNew ? cancelEdit() : router.back())}
            className="flex items-center gap-2 h-6 px-3 rounded-lg bg-gray-800 border border-gray-500 text-gray-400 dark:text-gray-500 hover:text-gray-300 text-xs shrink-0 transition-colors"
          >
            <span>←</span> {mode === 'edit' && !isNew ? 'Cancel' : 'Back'}
          </button>
        </div>
        <div className="w-full">
          <div className="flex justify-end gap-2">
            {mode === 'view' && (
              <button
                onClick={() => setMode('edit')}
                className="flex items-center h-6 px-3 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
              >
                Edit Routine
              </button>
            )}
            {mode === 'edit' && (
              <button
                onClick={save}
                disabled={saving || !name.trim() || entries.length === 0}
                className="flex items-center h-6 px-3 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : isNew ? 'Create Routine' : 'Save Routine'}
              </button>
            )}
          </div>
        </div>
      </div>

      <h1 className="flex justify-start my-4 text-xl font-bold text-gray-900 dark:text-white">
        {mode === 'view' ? routineName : (isNew ? 'New Routine' : 'Edit Routine')}
      </h1>

      {/* ── VIEW MODE ── */}
      {mode === 'view' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <div className="text-2xl font-bold text-brand-600">{timesCompleted}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Times completed</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <div className="text-base font-bold text-brand-600 mt-1">{lastDone ?? '—'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Last completed</div>
            </div>
          </div>

          {/* Exercise list */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Exercises</h2>
            </div>
            {routineExercises.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500">No exercises yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {routineExercises.map((re, i) => (
                  <div key={re.id} className="flex items-center px-4 py-3 gap-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-5 shrink-0">{i + 1}</span>
                    <Link
                      href={`/exercises/${re.exercise.id}`}
                      className="flex-1 min-w-0 text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate"
                    >
                      {re.exercise.name}
                    </Link>
                    {re.exercise.muscle_group && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 hidden sm:block">
                        {re.exercise.muscle_group}
                      </span>
                    )}
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
                      {re.default_sets} × {re.default_reps ?? '?'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Radar chart */}
          {radarData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-4 p-4">
              <div className="flex items-center justify-between mb-0.5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Muscle Groups</h2>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  {(['radar', 'trend'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setRadarView(v)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        radarView === v ? 'bg-brand-600 text-white' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {v === 'radar' ? 'Snapshot' : 'Over time'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                {radarView === 'radar'
                  ? 'Sets per muscle across all sessions'
                  : 'Sets per muscle by month'}
              </p>
              {radarView === 'radar' ? (
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} tickCount={4} />
                    <Radar dataKey="sets" stroke="#ff6e35" fill="#ff6e35" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
                      formatter={(v: number) => [`${v} sets`, 'Sets']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <MuscleProgressChart data={trendEntries} metric="sets" />
              )}
            </div>
          )}

          {/* History */}
          {history.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">History</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {history.map((w) => (
                  <Link
                    key={w.id}
                    href={`/workouts/${w.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {w.name ?? routineName}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {format(new Date(w.date + 'T00:00:00'), 'EEE, MMM d, yyyy')}
                        {' · '}
                        {w.setCount} set{w.setCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600 ml-2">›</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
              This routine hasn&apos;t been used yet.
            </p>
          )}
        </>
      )}

      {/* ── EDIT MODE ── */}
      {mode === 'edit' && (
        <>
          {/* Routine name */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Routine name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push Day, Leg Day..."
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {/* Exercise entries */}
          {entries.map((entry, idx) => (
            <div
              key={idx}
              className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border mb-3 transition-all duration-300 ${
                justMoved === idx
                  ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-300 dark:ring-brand-600'
                  : 'border-gray-100 dark:border-gray-700'
              }`}
            >
              <div className="flex gap-2 items-center mb-3">
                <select
                  value={entry.exercise_id}
                  onChange={(e) => updateEntry(idx, 'exercise_id', e.target.value)}
                  className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select exercise...</option>
                  {exercises
                    .filter((ex) => !usedIds.has(ex.id) || ex.id === entry.exercise_id)
                    .map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
                {entries.length > 1 && (
                  <select
                    value={idx + 1}
                    onChange={(e) => swapExercise(idx, parseInt(e.target.value) - 1)}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-1 w-12 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0"
                    title="Move to position"
                  >
                    {entries.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                  </select>
                )}
                <button
                  onClick={() => removeExercise(idx)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none px-1 shrink-0"
                >×</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Default sets</label>
                  <input
                    type="number" inputMode="numeric" min="1" max="20"
                    value={entry.default_sets}
                    onChange={(e) => updateEntry(idx, 'default_sets', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Default reps (optional)</label>
                  <input
                    type="number" inputMode="numeric" min="1" max="100"
                    value={entry.default_reps}
                    onChange={(e) => updateEntry(idx, 'default_reps', e.target.value)}
                    placeholder="—"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Add exercise */}
          <button
            onClick={addExercise}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors mb-3"
          >
            + Add Exercise
          </button>

          {/* Create new exercise inline */}
          {creatingNew ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-2">
              <input
                autoFocus
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                placeholder="Exercise name"
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <div className="flex gap-2">
                <input
                  value={newExMuscle}
                  onChange={(e) => setNewExMuscle(e.target.value)}
                  placeholder="Muscle group (optional)"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={createExercise}
                  disabled={!newExName.trim()}
                  className="bg-brand-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >Create</button>
                <button
                  onClick={() => { setCreatingNew(false); setNewExName(''); setNewExMuscle('') }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 px-2 text-sm"
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreatingNew(true)}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-brand-600 mb-4 pl-1"
            >
              + Create new exercise
            </button>
          )}
        </>
      )}
    </div>
  )
}
