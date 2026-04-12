-- Run this in the Supabase SQL Editor
-- Adds notes/link to exercises, default_reps to routine_exercises,
-- and a table for per-exercise notes within a workout session.

alter table exercises add column if not exists notes text;
alter table exercises add column if not exists link text;

alter table routine_exercises add column if not exists default_reps integer;

create table if not exists workout_exercise_notes (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references workout_logs(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  notes text not null,
  created_at timestamp with time zone default now(),
  unique(workout_log_id, exercise_id)
);

alter table workout_exercise_notes enable row level security;
create policy "Allow all" on workout_exercise_notes for all using (true) with check (true);
