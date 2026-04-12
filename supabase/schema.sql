-- Workout Tracker Database Schema
-- Run this in the Supabase SQL Editor

-- Routines (named workout templates, e.g. "Push Day", "Leg Day")
create table routines (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default now()
);

-- Exercises (a library of movements)
create table exercises (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  muscle_group text,
  created_at timestamp with time zone default now()
);

-- Workout sessions (one per day you train)
create table workout_logs (
  id uuid default gen_random_uuid() primary key,
  date date not null default current_date,
  routine_id uuid references routines(id) on delete set null,
  notes text,
  created_at timestamp with time zone default now()
);

-- Individual sets within a workout session
create table sets (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references workout_logs(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete restrict,
  set_number integer not null,
  reps integer,
  weight numeric(6, 2),
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table routines enable row level security;
alter table exercises enable row level security;
alter table workout_logs enable row level security;
alter table sets enable row level security;

-- Allow all operations (open access — add auth later if needed)
create policy "Allow all" on routines for all using (true) with check (true);
create policy "Allow all" on exercises for all using (true) with check (true);
create policy "Allow all" on workout_logs for all using (true) with check (true);
create policy "Allow all" on sets for all using (true) with check (true);

-- Seed common exercises
insert into exercises (name, muscle_group) values
  ('Bench Press', 'Chest'),
  ('Incline Bench Press', 'Chest'),
  ('Dumbbell Fly', 'Chest'),
  ('Squat', 'Legs'),
  ('Leg Press', 'Legs'),
  ('Romanian Deadlift', 'Legs'),
  ('Leg Curl', 'Legs'),
  ('Deadlift', 'Back'),
  ('Barbell Row', 'Back'),
  ('Lat Pulldown', 'Back'),
  ('Pull-Up', 'Back'),
  ('Seated Cable Row', 'Back'),
  ('Overhead Press', 'Shoulders'),
  ('Lateral Raise', 'Shoulders'),
  ('Dumbbell Curl', 'Arms'),
  ('Barbell Curl', 'Arms'),
  ('Tricep Pushdown', 'Arms'),
  ('Skull Crusher', 'Arms'),
  ('Plank', 'Core'),
  ('Cable Crunch', 'Core');
