export interface Routine {
  id: string
  name: string
  created_at: string
}

export interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  primary_muscle: string | null
  secondary_muscle: string | null
  notes: string | null
  link: string | null
  user_id: string | null
  created_at: string
}

export interface WorkoutLog {
  id: string
  date: string
  routine_id: string | null
  notes: string | null
  created_at: string
  routine?: { name: string } | null
  sets?: WorkoutSet[]
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  default_sets: number
  default_reps: number | null
  sort_order: number
  created_at: string
  exercise?: Exercise
}

export interface WorkoutSet {
  id: string
  workout_log_id: string
  exercise_id: string
  set_number: number
  reps: number | null
  weight: number | null
  created_at: string
  exercise?: { name: string } | null
}

export interface WorkoutExerciseNote {
  id: string
  workout_log_id: string
  exercise_id: string
  notes: string
  created_at: string
}
