# Workout Tracker — Setup Guide

## Prerequisites

- Node.js 18+ — download at https://nodejs.org (choose the **LTS** version)
- A free Supabase account — sign up at https://supabase.com
- A free Vercel account (optional, for phone access) — sign up at https://vercel.com

---

## Step 1 — Install Node.js

Download and install Node.js from https://nodejs.org.
Choose the **LTS** (Long Term Support) version. After installing, restart your terminal.

Verify it worked:
```
node --version
npm --version
```

---

## Step 2 — Set up Supabase

1. Go to https://supabase.com and create a free account.
2. Click **New project**. Give it a name like `workout-tracker`. Set a database password (save it somewhere).
3. Wait ~1 minute for the project to initialize.
4. In the left sidebar, click **SQL Editor**.
5. Copy the entire contents of `supabase/schema.sql` in this project.
6. Paste it into the SQL Editor and click **Run**.

This creates your tables and seeds 20 common exercises.

---

## Step 3 — Get your Supabase credentials

1. In your Supabase project, go to **Settings → API** (in the left sidebar).
2. Copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

---

## Step 4 — Configure environment variables

1. In this project folder, copy the example file:
   ```
   cp .env.local.example .env.local
   ```
   (On Windows you can also just duplicate the file and rename it.)

2. Open `.env.local` and fill in your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## Step 5 — Install dependencies and run

Open a terminal in the `workout-tracker` folder and run:

```
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

---

## Step 6 — Deploy to Vercel (for phone access)

Vercel gives you a public URL you can open on any device.

1. Push this folder to a new GitHub repository.
2. Go to https://vercel.com, click **Add New → Project**, and import your repo.
3. Before deploying, add your environment variables under **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. Vercel gives you a URL like `https://workout-tracker-xyz.vercel.app`.
5. Open that URL on your phone — it works like a mobile app.

---

## Project structure

```
workout-tracker/
├── app/
│   ├── page.tsx          Dashboard (home)
│   ├── log/page.tsx      Log a workout
│   ├── history/page.tsx  View past workouts
│   ├── progress/page.tsx Weight/volume charts
│   └── routines/page.tsx Manage routines
├── components/
│   ├── Nav.tsx           Navigation (desktop sidebar + mobile bottom bar)
│   └── ExerciseChart.tsx Line chart component
├── lib/
│   ├── supabase.ts       Supabase client
│   └── types.ts          TypeScript types
└── supabase/
    └── schema.sql        Database schema (run once in Supabase)
```
