'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  startOfWeek, subWeeks, subDays, addDays,
  eachDayOfInterval, eachWeekOfInterval,
  format, isAfter, startOfDay, differenceInCalendarDays,
} from 'date-fns'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface WorkoutDay {
  date: string
  name?: string | null
  routineName: string | null
  workoutId?: string
}

export interface FilterRange {
  from: string
  to: string
}

const PRESETS = [
  { label: '5W', days: 35 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const

function parseDate(str: string) {
  return new Date(str + 'T12:00:00')
}

export default function WorkoutActivity({
  workouts,
  onFilterChange,
  dayDetails,
}: {
  workouts: WorkoutDay[]
  onFilterChange?: (range: FilterRange | null) => void
  /** Per-date list of exercises done — shown as links when a day is tapped */
  dayDetails?: Record<string, Array<{ id: string; name: string }>>
}) {
  const today = startOfDay(new Date())
  const todayStr = format(today, 'yyyy-MM-dd')

  const [fromDate, setFromDate] = useState(format(startOfWeek(subWeeks(today, 4)), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(todayStr)
  const [activePreset, setActivePreset] = useState<string>('5W')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null)

  function clearSelection() {
    setSelectedDay(null)
    setSelectedWeek(null)
    onFilterChange?.(null)
  }

  function applyPreset(label: string, days: number) {
    setActivePreset(label)
    clearSelection()
    setToDate(todayStr)
    if (days === 0) {
      setFromDate(workouts.length > 0 ? workouts[workouts.length - 1].date : todayStr)
    } else {
      setFromDate(format(subDays(today, days - 1), 'yyyy-MM-dd'))
    }
  }

  const workoutMap = useMemo(() => {
    const map = new Map<string, { routineName: string | null; workoutId: string | null }>()
    workouts.forEach((w) => {
      if (!map.has(w.date)) map.set(w.date, { routineName: w.routineName, workoutId: w.workoutId ?? null })
    })
    return map
  }, [workouts])

  const filtered = useMemo(
    () => workouts.filter((w) => w.date >= fromDate && w.date <= toDate),
    [workouts, fromDate, toDate]
  )

  const rangeDays = Math.max(1, differenceInCalendarDays(parseDate(toDate), parseDate(fromDate)) + 1)
  const useCalendar = rangeDays <= 42

  const weekCount = Math.max(1, Math.ceil(rangeDays / 7))
  const weeklyAvg = (filtered.length / weekCount).toFixed(1)

  const byMonth = useMemo(() => {
    const acc: Record<string, number> = {}
    filtered.forEach((w) => {
      const key = format(parseDate(w.date), 'MMM yyyy')
      acc[key] = (acc[key] || 0) + 1
    })
    return acc
  }, [filtered])

  const calendarStart = startOfWeek(parseDate(fromDate))
  const calendarEnd = addDays(startOfWeek(parseDate(toDate)), 6)
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const chartData = useMemo(() => {
    if (filtered.length === 0) return []
    return eachWeekOfInterval({ start: parseDate(fromDate), end: parseDate(toDate) }).map((weekStart) => {
      const weekEnd = addDays(weekStart, 6)
      const ws = format(weekStart, 'yyyy-MM-dd')
      const we = format(weekEnd, 'yyyy-MM-dd')
      return {
        week: format(weekStart, 'M/d'),
        workouts: filtered.filter((w) => w.date >= ws && w.date <= we).length,
        weekStart: ws,
        weekEnd: we,
      }
    })
  }, [filtered, fromDate, toDate])

  const hasActiveFilter = selectedDay !== null || selectedWeek !== null
  const presetInactive = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Activity</h2>
        {hasActiveFilter && onFilterChange && (
          <button onClick={clearSelection} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
            Clear filter ×
          </button>
        )}
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.label, p.days)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activePreset === p.label ? 'bg-brand-600 text-white' : presetInactive
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex gap-2 items-center mb-4">
        <input
          type="date" value={fromDate} max={toDate}
          onChange={(e) => { setFromDate(e.target.value); setActivePreset(''); clearSelection() }}
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">to</span>
        <input
          type="date" value={toDate} min={fromDate} max={todayStr}
          onChange={(e) => { setToDate(e.target.value); setActivePreset(''); clearSelection() }}
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {useCalendar ? (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 dark:text-gray-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const inRange = dateStr >= fromDate && dateStr <= toDate
              const isFuture = isAfter(day, today)
              const hasWorkout = inRange && workoutMap.has(dateStr)
              const isToday = dateStr === todayStr
              const isSelected = selectedDay === dateStr

              let cellClass: string
              if (!inRange || isFuture) cellClass = 'text-gray-200 dark:text-gray-700 cursor-default'
              else if (hasWorkout) cellClass = `bg-brand-600 text-white cursor-pointer${isSelected ? ' ring-2 ring-brand-300 ring-offset-1 dark:ring-offset-gray-800' : ''}`
              else if (isToday) cellClass = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600'
              else cellClass = 'text-gray-300 dark:text-gray-600'

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (!hasWorkout) return
                    const next = isSelected ? null : dateStr
                    setSelectedDay(next)
                    setSelectedWeek(null)
                    onFilterChange?.(next ? { from: next, to: next } : null)
                  }}
                  className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium transition-all ${cellClass}`}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Day detail popup */}
          {selectedDay && workoutMap.has(selectedDay) && (() => {
            const entry = workoutMap.get(selectedDay)!
            const label = entry.name ?? entry.routineName ?? 'Workout'
            return (
            <div className="mt-3 bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2">
              <div className="text-sm font-medium text-brand-800 dark:text-brand-300">
                {format(parseDate(selectedDay), 'EEEE, MMMM d')}
                {' · '}
                {entry.workoutId ? (
                  <Link
                    href={`/workouts/${entry.workoutId}`}
                    className="underline underline-offset-2 hover:text-brand-600 dark:hover:text-brand-200 transition-colors"
                  >
                    {label}
                  </Link>
                ) : label}
              </div>
              {dayDetails?.[selectedDay] && dayDetails[selectedDay].length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {dayDetails[selectedDay].map((ex) => (
                    <Link
                      key={ex.id}
                      href={`/exercises/${ex.id}`}
                      className="text-xs bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full hover:bg-brand-200 dark:hover:bg-brand-800 transition-colors"
                    >
                      {ex.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            )
          })()}

          <div className="flex items-center gap-2 mt-3 text-xs text-gray-400 dark:text-gray-500">
            <div className="w-3 h-3 rounded bg-brand-600 shrink-0" />
            <span>
              {onFilterChange
                ? (hasActiveFilter ? 'Filtering workouts below · tap again to clear' : 'Tap a workout day to filter below')
                : 'Tap a workout day for details'}
            </span>
          </div>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
                formatter={(v: number) => [v, 'Workouts']}
              />
              <Bar
                dataKey="workouts"
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(data: { weekStart: string; weekEnd: string }) => {
                  const isSame = selectedWeek === data.weekStart
                  const next = isSame ? null : data.weekStart
                  setSelectedWeek(next)
                  setSelectedDay(null)
                  onFilterChange?.(next ? { from: data.weekStart, to: data.weekEnd } : null)
                }}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.weekStart}
                    fill="#e55422"
                    opacity={selectedWeek && selectedWeek !== entry.weekStart ? 0.35 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
            <div className="w-3 h-3 rounded bg-brand-600 shrink-0" />
            <span>
              {onFilterChange
                ? (hasActiveFilter ? 'Filtering workouts below · tap again to clear' : 'Tap a bar to filter by week')
                : 'Workout frequency by week'}
            </span>
          </div>
        </>
      )}

      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-2xl font-bold text-brand-600">{filtered.length}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Workouts in range</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-brand-600">{weeklyAvg}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Per week avg</div>
          </div>
        </div>

        {Object.keys(byMonth).length > 0 && (
          <div className="space-y-2">
            {Object.entries(byMonth).map(([month, count]) => (
              <div key={month} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400 w-20 shrink-0">{month}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-brand-500 h-full rounded-full"
                    style={{ width: `${(count / filtered.length) * 100}%` }}
                  />
                </div>
                <span className="text-gray-700 dark:text-gray-300 font-medium w-4 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
