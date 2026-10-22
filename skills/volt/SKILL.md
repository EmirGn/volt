---
name: volt
description: Read and change Emir's training data in Volt, his own gym app, through the `volt` CLI. Use for anything about his training, gym sessions, workouts, routines, lifts, sets, PRs or progression, food, calories, protein or macros, supplements and daily habits, bodyweight, or the Volt app's data, e.g. "what's today's workout", "how's my bench going", "log 2 eggs", "did I hit protein this week", "I weigh 69.2", "move Pull B to Saturday".
---

# Volt

Volt is Emir's own workout and nutrition app (`~/nodes/volt`, Expo). The phone is where training happens: it logs
offline to its own SQLite and syncs with the **hub** (Vercel function + Turso) whenever it has internet. The hub is the
cloud copy of the same tables. You read and write the hub with the `volt` CLI; anything you write reaches the phone
on its next sync (launch, foreground, every 2 min while open). Last write wins per row, by time.

Run it as `volt …` (if it isn't on PATH: `node ~/nodes/volt/cli/volt.mjs …`). Config comes from `VOLT_HUB_URL` /
`VOLT_HUB_TOKEN` or `~/.volt/hub.env`. Never print, store or paste the token anywhere.

His plan, goals and context (split, current numbers, what he is aiming for) live in `~/agent-memory/Emir/Gym.md`. Read
it before giving training or diet advice, and update it when he reports new numbers or changes the plan.

## Commands

```
volt today                        planned routine (targets, last performance, → next weight), food vs targets, habits, last workout
volt week                         Mon–Sun table: planned/done workouts, sets, volume, kcal, protein, bodyweight + averages
volt exercise "<name>"            every session of one exercise: sets kg×reps, best set, e1RM (Epley), PRs
volt log food "<name>" --kcal N [--protein N --carbs N --fat N --meal lunch --day YYYY-MM-DD]
volt log weight <kg> [--day YYYY-MM-DD]
volt sql "<select>" [--json]      any read-only query (one statement)
volt exec "<sql>" ["<sql>" …]     writes, all in one transaction
volt status | volt schema | volt id
```

`today`, `week`, `exercise`, `sql` and `log` take `--json`. `exercise` matches case-insensitive substrings and asks
you to be more specific when several match. `log food` defaults the day to today and the meal by the clock
(<11 breakfast, <16 lunch, <21 dinner, else snacks).

## Schema (same as the app)

Times are **ms since epoch** (local wall clock when shown). `day` columns are **local dates** `'YYYY-MM-DD'`.
Ids are time-ordered numbers (~1.8e15) from `newId()`; old seed rows have small ids.

| Table | Columns and meaning |
|---|---|
| exercises | id, name (unique), tip |
| routines | id, name ("Push A"), focus, weekday (1 = Mon … 7 = Sun, null = unscheduled; one routine per weekday), position |
| routine_exercises | id, routine_id, exercise_id, position, sets, rep_min, rep_max, rest_sec, superset (rows sharing a number in one routine are a superset) |
| workouts | id, routine_id (nullable), name, started_at, finished_at (null = still in progress) |
| sets | id, workout_id, exercise_id, set_index (1-based per exercise in a workout), kg, reps, done_at |
| food_presets | id, name, detail, kcal, protein, carbs, fat (grams), last_used |
| food_entries | id, day, meal (breakfast \| lunch \| dinner \| snacks), name, kcal, protein, carbs, fat (grams), created_at |
| habits | id, kind (supplement \| task), title, dose, position, archived (0/1) |
| habit_logs | habit_id, day, done_at. PK (habit_id, day); a row means done that day |
| bodyweight | day (PK), kg |
| settings | key, value (text): kcal_target, protein_target, carbs_target, fat_target, kg_step, plan_start, workout_time ("17:00") |

Defaults when a setting is missing: 3100 kcal, 140 g protein, 430 g carbs, 90 g fat, kg_step 2.5.
Only count finished workouts (`finished_at IS NOT NULL`) as history, like the app does.
Deleting a routine deletes its routine_exercises and clears `workouts.routine_id`; deleting a workout deletes its
sets; deleting a habit deletes its logs. Exercises still used by sets or routines can't be deleted.

## Rules

- Prefer the dedicated commands. For anything else (trends, comparisons, analysis) write SQL with `volt sql`,
  e.g. weekly volume per exercise, protein per day, sets per muscle group.
- Writes go through `volt exec`. Leave `id` out of an INSERT (the hub assigns max + 1) or get one from `volt id`
  when you need to reference the new row in the same exec. Use upserts for `bodyweight` and `settings`:
  `INSERT … ON CONFLICT(day) DO UPDATE SET kg = excluded.kg`.
- Small, clearly asked-for writes (log a meal, a weight, tick a supplement) you can just do, then say what you did.
  **Before deleting anything or editing more than a few rows** (moving a routine, rewriting a plan, fixing history),
  show Emir the exact change (the SQL, or a before/after) and ask first.
- Never touch the settings keys `notifications_asked`, `hub_*` or `local_*`; they belong to the phone.
- Don't write to `_meta`, `_counter`, `_flag` (the hub refuses anyway) or change the schema.
- Logging a set for him: find or start the workout row first (`workouts` with `started_at`), then `sets` with the
  next `set_index` for that exercise and `done_at` = now. Usually he logs sets on the phone; don't do this unasked.

## Training logic

- **Double progression.** Each routine exercise has a rep range (rep_min–rep_max). When every planned set of the
  last session reached rep_max, the next session adds `kg_step` kg (2.5 by default) and works back up from rep_min.
  Otherwise keep the weight and add reps. `volt today` shows this as `→ 27.5 kg`.
- e1RM (Epley) = kg × (1 + reps / 30). Best set = heaviest kg, then most reps. A PR is a best set heavier than any
  earlier session of that exercise.
- Volume = Σ kg × reps.
- Weeks are ISO, Monday to Sunday, local time.

Answer in plain language, with the numbers that matter, the way he talks (casual, Turkish or English as he writes).
