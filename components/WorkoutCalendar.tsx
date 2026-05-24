'use client'

import { useState } from 'react'
import {
  startOfWeek,
  subWeeks,
  addDays,
  eachDayOfInterval,
  format,
  isAfter,
  startOfDay,
  parseISO,
} from 'date-fns'

interface WorkoutDay {
  date: string // 'yyyy-MM-dd'
  routineName: string | null
}

export default function WorkoutCalendar({ workouts }: { workouts: WorkoutDay[] }) {
  const today = startOfDay(new Date())
  const todayStr = format(today, 'yyyy-MM-dd')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Map date -> routine name (first occurrence wins, since workouts are newest-first)
  const workoutMap = new Map<string, string | null>()
  workouts.forEach((w) => {
    if (!workoutMap.has(w.date)) workoutMap.set(w.date, w.routineName)
  })

  // 5-week grid, always starting on Sunday
  const gridStart = startOfWeek(subWeeks(today, 4))
  const gridEnd = addDays(startOfWeek(today), 6)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Last 5 Weeks</h2>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-400">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isFuture = isAfter(day, today)
          const hasWorkout = workoutMap.has(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = selectedDay === dateStr

          const cellClass = isFuture
            ? 'text-gray-100 cursor-default'
            : hasWorkout
            ? `bg-brand-600 text-white cursor-pointer ${isSelected ? 'ring-2 ring-brand-300 ring-offset-1' : ''}`
            : isToday
            ? 'bg-gray-100 text-gray-600 ring-1 ring-gray-300'
            : 'text-gray-300'

          return (
            <button
              key={dateStr}
              onClick={() => hasWorkout && setSelectedDay(isSelected ? null : dateStr)}
              className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium transition-all ${cellClass}`}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      {/* Detail panel shown when a day is selected */}
      {selectedDay && workoutMap.has(selectedDay) && (
        <div className="mt-3 text-sm bg-brand-50 text-brand-800 rounded-lg px-3 py-2">
          <span className="font-medium">
            {format(parseISO(selectedDay), 'EEEE, MMMM d')}
          </span>
          {' · '}
          {workoutMap.get(selectedDay) || 'Workout'}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
        <div className="w-3 h-3 rounded bg-brand-600" />
        <span>Workout logged — tap a day for details</span>
      </div>
    </div>
  )
}
