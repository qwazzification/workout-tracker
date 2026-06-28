import { supabase } from '@/lib/supabase'

// A personal record = the heaviest weight a user has logged for an exercise
// (with the reps performed at that weight). Derived on the fly from `sets`
// joined to the owning `workout_logs` — no separate table to keep in sync.

export interface PR {
  weight: number
  reps: number | null
  date: string
}

export interface NamedPR extends PR {
  exerciseId: string
  name: string
}

// Heaviest set for a single exercise across a user's own logged sets.
export async function getExercisePR(exerciseId: string, userId: string): Promise<PR | null> {
  const { data } = await supabase
    .from('sets')
    .select('reps, weight, workout_logs!inner(date, user_id)')
    .eq('exercise_id', exerciseId)
    .eq('workout_logs.user_id', userId)
    .not('weight', 'is', null)
    .order('weight', { ascending: false })
    .order('reps', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as unknown as { reps: number | null; weight: number; workout_logs: { date: string } | null }
  return { weight: row.weight, reps: row.reps, date: row.workout_logs?.date ?? '' }
}

// Heaviest set per exercise for a set of exercises (a user's own data).
export async function getExercisePRs(exerciseIds: string[], userId: string): Promise<Record<string, PR>> {
  if (exerciseIds.length === 0) return {}
  const { data } = await supabase
    .from('sets')
    .select('exercise_id, reps, weight, workout_logs!inner(date, user_id)')
    .in('exercise_id', exerciseIds)
    .eq('workout_logs.user_id', userId)
    .not('weight', 'is', null)
  const rows = (data ?? []) as unknown as {
    exercise_id: string; reps: number | null; weight: number; workout_logs: { date: string } | null
  }[]
  const out: Record<string, PR> = {}
  for (const r of rows) {
    const cur = out[r.exercise_id]
    if (!cur || r.weight > cur.weight || (r.weight === cur.weight && (r.reps ?? 0) > (cur.reps ?? 0))) {
      out[r.exercise_id] = { weight: r.weight, reps: r.reps, date: r.workout_logs?.date ?? '' }
    }
  }
  return out
}

// Heaviest set per exercise from a user's PUBLIC workouts only — what a friend
// is allowed to see. Sorted heaviest-first.
export async function getPublicPRs(userId: string): Promise<NamedPR[]> {
  const { data } = await supabase
    .from('sets')
    .select('exercise_id, reps, weight, exercise:exercises(name), workout_logs!inner(date, user_id, is_public)')
    .eq('workout_logs.user_id', userId)
    .eq('workout_logs.is_public', true)
    .not('weight', 'is', null)
  const rows = (data ?? []) as unknown as {
    exercise_id: string; reps: number | null; weight: number
    exercise: { name: string } | null; workout_logs: { date: string } | null
  }[]
  const best: Record<string, NamedPR> = {}
  for (const r of rows) {
    const cur = best[r.exercise_id]
    if (!cur || r.weight > cur.weight || (r.weight === cur.weight && (r.reps ?? 0) > (cur.reps ?? 0))) {
      best[r.exercise_id] = {
        exerciseId: r.exercise_id,
        name: r.exercise?.name ?? 'Exercise',
        weight: r.weight,
        reps: r.reps,
        date: r.workout_logs?.date ?? '',
      }
    }
  }
  return Object.values(best).sort((a, b) => b.weight - a.weight)
}
