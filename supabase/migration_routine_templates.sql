-- Run this in the Supabase SQL Editor (Settings → SQL Editor)
-- Adds support for routine exercise templates

create table routine_exercises (
  id uuid default gen_random_uuid() primary key,
  routine_id uuid references routines(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  default_sets integer not null default 3,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  unique(routine_id, exercise_id)
);

alter table routine_exercises enable row level security;
create policy "Allow all" on routine_exercises for all using (true) with check (true);
