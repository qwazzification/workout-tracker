'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Exercise } from '@/lib/types'
import ExerciseChart, { ChartPoint } from '@/components/ExerciseChart'
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

interface RawPoint {
  rawDate: string   // 'yyyy-MM-dd' — used for date filtering
  maxWeight: number
  totalVolume: number
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

  // Chart state — store raw dates so time-range filter works correctly
  const [rawPoints, setRawPoints] = useState<RawPoint[]>([])
  const [preset, setPreset] = useState('3M')
  const [chartLoading, setChartLoading] = useState(true)

  // All-time stats
  const [totalSets, setTotalSets] = useState(0)
  const [prDate, setPrDate] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('exercises').select('*').eq('id', id).single()
      if (!data) { setNotFound(true); setLoading(false); return }
      setExercise(data as Exercise)
      setEditForm({
        name: data.name,
        muscle_group: data.muscle_group ?? '',
        primary_muscle: data.primary_muscle ?? '',
        secondary_muscle: data.secondary_muscle ?? '',
        notes: data.notes ?? '',
        link: data.link ?? '',
      })
      setLoading(false)
      loadChart()
    }
    load()
  }, [id])

  async function loadChart() {
    setChartLoading(true)
    const { data: sets } = await supabase
      .from('sets')
      .select('reps, weight, workout_logs(date)')
      .eq('exercise_id', id)
      .not('weight', 'is', null)

    if (!sets) { setChartLoading(false); return }

    type RawRow = { reps: number | null; weight: number | null; workout_logs: { date: string } | null }
    const rows = sets as unknown as RawRow[]

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

    const points: RawPoint[] = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        rawDate: date,
        maxWeight: Math.round(vals.maxWeight * 10) / 10,
        totalVolume: Math.round(vals.totalVolume),
      }))

    setRawPoints(points)
    setTotalSets(rows.length)
    setPrDate(maxWDate ? format(new Date(maxWDate + 'T00:00:00'), 'MMM d, yyyy') : null)
    setChartLoading(false)
  }

  /** Filter raw points by the selected preset and format dates for display. */
  function getChartData(): ChartPoint[] {
    const presetObj = TIME_PRESETS.find((x) => x.label === preset)
    const cutoff = presetObj && presetObj.days > 0
      ? format(subDays(new Date(), presetObj.days), 'yyyy-MM-dd')
      : '2000-01-01'
    return rawPoints
      .filter((p) => p.rawDate >= cutoff)
      .map((p) => ({
        date: format(new Date(p.rawDate + 'T00:00:00'), 'M/d'),
        maxWeight: p.maxWeight,
        totalVolume: p.totalVolume,
      }))
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
  // Stats are all-time (not affected by the chart time range)
  const allTimeMax = rawPoints.length > 0 ? Math.max(...rawPoints.map((d) => d.maxWeight)) : null
  const sessionCount = rawPoints.length

  const btnInactive = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
  const btnActive = 'bg-brand-600 text-white'

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
        </div>
        {exercise.muscle_group && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{exercise.muscle_group}</p>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Edit Exercise</p>
          {(
            [
              { key: 'name', label: 'Name', placeholder: '' },
              { key: 'muscle_group', label: 'Muscle group', placeholder: 'e.g. Chest, Back, Legs...' },
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

      {/* All-time stats grid */}
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
        ) : (
          <ExerciseChart data={getChartData()} />
        )}
      </div>
    </div>
  )
}
