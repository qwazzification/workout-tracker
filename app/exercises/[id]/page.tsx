'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import ExerciseChart, { ChartPoint } from '@/components/ExerciseChart'
import CardioChart, { CardioPoint, fmtPace } from '@/components/CardioChart'
import { format, subDays } from 'date-fns'

const inputClass =
  'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'

const TIME_PRESETS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const

// Strength chart data
interface StrengthRawPoint {
  rawDate: string
  maxWeight: number
  totalVolume: number
}

// Cardio chart data
interface CardioRawPoint {
  rawDate: string
  paceSeconds: number  // best pace that session (sec/mile)
  distance: number     // total distance that session (miles)
}

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Edit state (custom exercises only)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', muscle_group: '', primary_muscle: '', secondary_muscle: '', notes: '', link: '',
  })

  const [preset, setPreset] = useState('3M')
  const [chartLoading, setChartLoading] = useState(true)

  // Strength stats
  const [strengthPoints, setStrengthPoints] = useState<StrengthRawPoint[]>([])
  const [totalSets, setTotalSets] = useState(0)
  const [prDate, setPrDate] = useState<string | null>(null)

  // Cardio stats
  const [cardioPoints, setCardioPoints] = useState<CardioRawPoint[]>([])
  const [bestPaceSecs, setBestPaceSecs] = useState<number | null>(null)
  const [bestPaceDate, setBestPaceDate] = useState<string | null>(null)
  const [totalDistance, setTotalDistance] = useState(0)
  const [cardioSessions, setCardioSessions] = useState(0)

  const isCardio = exercise?.muscle_group?.trim().toLowerCase() === 'cardio'

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('exercises').select('*').eq('id', id).single()
      if (!data) { setNotFound(true); setLoading(false); return }
      const ex = data as Exercise
      setExercise(ex)
      setEditForm({
        name: ex.name,
        muscle_group: ex.muscle_group ?? '',
        primary_muscle: ex.primary_muscle ?? '',
        secondary_muscle: ex.secondary_muscle ?? '',
        notes: ex.notes ?? '',
        link: ex.link ?? '',
      })
      setLoading(false)
      if (ex.muscle_group?.toLowerCase() === 'cardio') {
        loadCardioChart()
      } else {
        loadStrengthChart()
      }
    }
    load()
  }, [id])

  async function loadStrengthChart() {
    setChartLoading(true)
    const { data: sets } = await supabase
      .from('sets')
      .select('reps, weight, workout_logs(date)')
      .eq('exercise_id', id)
      .not('weight', 'is', null)

    if (!sets) { setChartLoading(false); return }

    type Row = { reps: number | null; weight: number | null; workout_logs: { date: string } | null }
    const rows = sets as unknown as Row[]

    const byDate: Record<string, { maxWeight: number; totalVolume: number }> = {}
    let maxW = 0
    let maxWDate: string | null = null

    rows.forEach((s) => {
      const date = s.workout_logs?.date
      if (!date || s.weight == null) return
      const w = s.weight
      const r = s.reps ?? 1
      if (!byDate[date]) byDate[date] = { maxWeight: 0, totalVolume: 0 }
      byDate[date].maxWeight = Math.max(byDate[date].maxWeight, w)
      byDate[date].totalVolume += w * r
      if (w > maxW) { maxW = w; maxWDate = date }
    })

    const points: StrengthRawPoint[] = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        rawDate: date,
        maxWeight: Math.round(vals.maxWeight * 10) / 10,
        totalVolume: Math.round(vals.totalVolume),
      }))

    setStrengthPoints(points)
    setTotalSets(rows.length)
    setPrDate(maxWDate ? format(new Date(maxWDate + 'T00:00:00'), 'MMM d, yyyy') : null)
    setChartLoading(false)
  }

  async function loadCardioChart() {
    setChartLoading(true)
    const { data: sets } = await supabase
      .from('sets')
      .select('duration_seconds, distance_miles, workout_logs(date)')
      .eq('exercise_id', id)
      .not('duration_seconds', 'is', null)

    if (!sets) { setChartLoading(false); return }

    type Row = { duration_seconds: number | null; distance_miles: number | null; workout_logs: { date: string } | null }
    const rows = sets as unknown as Row[]

    const byDate: Record<string, { bestPace: number; totalDist: number }> = {}
    let best = Infinity
    let bestDate: string | null = null
    let distSum = 0

    rows.forEach((s) => {
      const date = s.workout_logs?.date
      if (!date || s.duration_seconds == null) return
      const dist = s.distance_miles ?? 0
      if (!byDate[date]) byDate[date] = { bestPace: Infinity, totalDist: 0 }
      if (dist > 0) {
        const pace = s.duration_seconds / dist
        byDate[date].bestPace = Math.min(byDate[date].bestPace, pace)
        if (pace < best) { best = pace; bestDate = date }
      }
      byDate[date].totalDist += dist
      distSum += dist
    })

    const points: CardioRawPoint[] = Object.entries(byDate)
      .filter(([, v]) => v.bestPace !== Infinity)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        rawDate: date,
        paceSeconds: Math.round(vals.bestPace),
        distance: Math.round(vals.totalDist * 100) / 100,
      }))

    setCardioPoints(points)
    setBestPaceSecs(best === Infinity ? null : Math.round(best))
    setBestPaceDate(bestDate ? format(new Date(bestDate + 'T00:00:00'), 'MMM d, yyyy') : null)
    setTotalDistance(Math.round(distSum * 10) / 10)
    setCardioSessions(Object.keys(byDate).length)
    setTotalSets(rows.length)
    setChartLoading(false)
  }

  function getStrengthChartData(): ChartPoint[] {
    const cutoff = getCutoff()
    return strengthPoints
      .filter((p) => p.rawDate >= cutoff)
      .map((p) => ({
        date: format(new Date(p.rawDate + 'T00:00:00'), 'M/d'),
        maxWeight: p.maxWeight,
        totalVolume: p.totalVolume,
      }))
  }

  function getCardioChartData(): CardioPoint[] {
    const cutoff = getCutoff()
    return cardioPoints
      .filter((p) => p.rawDate >= cutoff)
      .map((p) => ({
        date: format(new Date(p.rawDate + 'T00:00:00'), 'M/d'),
        paceSeconds: p.paceSeconds,
        distance: p.distance,
      }))
  }

  function getCutoff(): string {
    const presetObj = TIME_PRESETS.find((x) => x.label === preset)
    return presetObj && presetObj.days > 0
      ? format(subDays(new Date(), presetObj.days), 'yyyy-MM-dd')
      : '2000-01-01'
  }

  function startEdit() {
    if (!exercise) return
    setEditForm({
      name: exercise.name,
      muscle_group: exercise.muscle_group ?? '',
      primary_muscle: exercise.primary_muscle ?? '',
      secondary_muscle: exercise.secondary_muscle ?? '',
      notes: exercise.notes ?? '',
      link: exercise.link ?? '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!editForm.name.trim()) return
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
      .eq('id', id)
      .select()
      .single()
    if (data) { setExercise(data as Exercise); setEditing(false) }
    setSaving(false)
  }

  async function deleteExercise() {
    if (!confirm('Delete this exercise? This will fail if it has been used in any logged workouts.')) return
    const { error } = await supabase.from('exercises').delete().eq('id', id)
    if (error) { alert('Cannot delete: ' + error.message); return }
    router.push('/exercises')
  }

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
  if (notFound) return (
    <div className="text-center py-16">
      <p className="text-gray-400 dark:text-gray-500 mb-4">Exercise not found.</p>
      <Link href="/exercises" className="text-brand-600 hover:underline text-sm">← Exercise Library</Link>
    </div>
  )
  if (!exercise) return null

  const isCustom = exercise.user_id !== null
  const btnInactive = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
  const btnActive = 'bg-brand-600 text-white'

  // Strength stats
  const allTimeMax = strengthPoints.length > 0 ? Math.max(...strengthPoints.map((d) => d.maxWeight)) : null
  const sessionCount = isCardio ? cardioSessions : strengthPoints.length

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
        <div className="w-full">
          <div className="flex justify-end gap-2">
            {isCustom && !editing && (
              <button
                onClick={startEdit}
                className="flex items-center h-6 px-3 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
              >
                Edit
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={saveEdit}
                  disabled={saving || !editForm.name.trim()}
                  className="flex items-center h-6 px-3 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center h-6 px-3 rounded-lg border border-gray-500 text-gray-400 dark:text-gray-500 hover:text-gray-300 text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteExercise}
                  className="flex items-center h-6 px-3 rounded-lg bg-red-800 text-white text-xs hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="my-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{exercise.name}</h1>
          {isCustom && (
            <span className="text-xs bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full font-medium">
              Custom
            </span>
          )}
          {isCardio && (
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
              Cardio
            </span>
          )}
        </div>
        {exercise.muscle_group && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{exercise.muscle_group}</p>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Edit Exercise</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Name</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Muscle group</label>
            <select
              value={editForm.muscle_group}
              onChange={(e) => setEditForm((p) => ({ ...p, muscle_group: e.target.value }))}
              className={inputClass}
            >
              <option value="">— none —</option>
              <option value="Cardio">Cardio</option>
              <option value="Chest">Chest</option>
              <option value="Back">Back</option>
              <option value="Shoulders">Shoulders</option>
              <option value="Arms">Arms</option>
              <option value="Legs">Legs</option>
              <option value="Core">Core</option>
              <option value="Full Body">Full Body</option>
            </select>
          </div>
          {(
            [
              { key: 'primary_muscle', label: 'Primary muscle', placeholder: 'e.g. Pecs, Lats...' },
              { key: 'secondary_muscle', label: 'Secondary muscles', placeholder: 'e.g. Triceps, Biceps...' },
            ] as { key: keyof typeof editForm; label: string; placeholder: string }[]
          ).map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
              <input
                value={editForm[key]}
                onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                className={inputClass}
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
              className={`resize-none ${inputClass}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Reference link (optional)</label>
            <input
              type="url"
              value={editForm.link}
              onChange={(e) => setEditForm((p) => ({ ...p, link: e.target.value }))}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Info card */}
      {!editing && (exercise.primary_muscle || exercise.secondary_muscle || exercise.notes || exercise.link) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-2">
          {exercise.primary_muscle && (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 shrink-0 w-28">Primary</span>
              <span className="text-gray-800 dark:text-gray-100">{exercise.primary_muscle}</span>
            </div>
          )}
          {exercise.secondary_muscle && (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 shrink-0 w-28">Secondary</span>
              <span className="text-gray-800 dark:text-gray-100">{exercise.secondary_muscle}</span>
            </div>
          )}
          {exercise.notes && (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 shrink-0 w-28">Notes</span>
              <span className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{exercise.notes}</span>
            </div>
          )}
          {exercise.link && (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 shrink-0 w-28">Reference</span>
              <a
                href={exercise.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline truncate"
              >
                {exercise.link.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      {isCardio ? (
        <>
          {(bestPaceSecs !== null || cardioSessions > 0) && (
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="text-xl font-bold text-brand-600">
                  {bestPaceSecs != null ? fmtPace(bestPaceSecs) : '—'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Best pace</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="text-xl font-bold text-brand-600">{totalDistance}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total miles</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="text-xl font-bold text-brand-600">{cardioSessions}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sessions</div>
              </div>
            </div>
          )}
          {bestPaceDate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 px-1">Best pace on {bestPaceDate}</p>
          )}
        </>
      ) : (
        <>
          {(allTimeMax !== null || sessionCount > 0) && (
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="text-xl font-bold text-brand-600">{allTimeMax ?? '—'}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Max weight (lbs)</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="text-xl font-bold text-brand-600">{sessionCount}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sessions</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="text-xl font-bold text-brand-600">{totalSets}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total sets</div>
              </div>
            </div>
          )}
          {prDate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 px-1">PR set on {prDate}</p>
          )}
        </>
      )}

      {/* Progress chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Progress</h2>

        <div className="flex gap-1.5 mb-4">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPreset(p.label)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${preset === p.label ? btnActive : btnInactive}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {chartLoading ? (
          <div className="flex items-center justify-center h-52 text-gray-400 dark:text-gray-500 text-sm">
            Loading...
          </div>
        ) : isCardio ? (
          <CardioChart data={getCardioChartData()} />
        ) : (
          <ExerciseChart data={getStrengthChartData()} />
        )}
      </div>
    </div>
  )
}
