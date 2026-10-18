import type { SQLiteBindValue } from 'expo-sqlite';
import { db, notify } from './db';

// ---------- dates ----------

export function dayKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(d: Date = new Date()) {
  return ((d.getDay() + 6) % 7) + 1;
}

export function startOfWeek(d: Date = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - (isoWeekday(d) - 1));
  return s;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- settings ----------

export type Targets = { kcal: number; protein: number; carbs: number; fat: number; kgStep: number; planStart: string };

export function getTargets(): Targets {
  const rows = db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    kcal: Number(m.kcal_target ?? 3100),
    protein: Number(m.protein_target ?? 140),
    carbs: Number(m.carbs_target ?? 430),
    fat: Number(m.fat_target ?? 90),
    kgStep: Number(m.kg_step ?? 2.5),
    planStart: m.plan_start ?? dayKey(),
  };
}

export function planWeek(): number {
  const start = new Date(getTargets().planStart + 'T00:00:00');
  const diff = startOfWeek().getTime() - startOfWeek(start).getTime();
  return Math.max(1, Math.round(diff / (7 * 86400000)) + 1);
}

export function getSetting(key: string): string | null {
  return db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/** When planned workouts usually start, "HH:MM". Reminders go out 15 minutes before. */
export function workoutTime(): string {
  return getSetting('workout_time') ?? '17:00';
}

// ---------- undo ----------

type Row = Record<string, SQLiteBindValue>;
export type Undo = () => void;

function take(table: string, where: string, ...args: SQLiteBindValue[]): Row[] {
  return db.getAllSync<Row>(`SELECT * FROM ${table} WHERE ${where}`, ...args);
}

function put(table: string, rows: Row[]) {
  for (const r of rows) {
    const cols = Object.keys(r);
    db.runSync(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ...cols.map((c) => r[c]),
    );
  }
}

/** Puts deleted rows back exactly as they were, ids included. */
function restorer(table: string, rows: Row[]): Undo {
  return () => {
    put(table, rows);
    notify();
  };
}

// ---------- routines ----------

export type Routine = { id: number; name: string; focus: string; weekday: number | null; exerciseCount: number };

export function getRoutines(): Routine[] {
  return db.getAllSync<Routine>(
    `SELECT r.id, r.name, r.focus, r.weekday, COUNT(re.id) AS exerciseCount
     FROM routines r LEFT JOIN routine_exercises re ON re.routine_id = r.id
     GROUP BY r.id ORDER BY r.position`,
  );
}

export function getRoutine(id: number): Routine | null {
  return getRoutines().find((r) => r.id === id) ?? null;
}

export type PlanItem = {
  id: number;
  exerciseId: number;
  name: string;
  tip: string | null;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  superset: number | null;
};

export function getPlanItems(routineId: number): PlanItem[] {
  return db.getAllSync<PlanItem>(
    `SELECT re.id, re.exercise_id AS exerciseId, e.name, e.tip, re.sets, re.rep_min AS repMin,
            re.rep_max AS repMax, re.rest_sec AS restSec, re.superset
     FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? ORDER BY re.position`,
    routineId,
  );
}

/** The routine scheduled for today, if any. */
export function todaysRoutine(): Routine | null {
  const wd = isoWeekday();
  return getRoutines().find((r) => r.weekday === wd) ?? null;
}

/** The next scheduled routine that hasn't been done yet this week, wrapping into next week. */
export function nextRoutine(): Routine | null {
  const routines = getRoutines().filter((r) => r.weekday != null);
  if (!routines.length) return null;
  const doneIds = new Set(weekWorkouts().map((w) => w.routineId));
  const today = isoWeekday();
  const upcoming = routines
    .filter((r) => (r.weekday as number) >= today && !doneIds.has(r.id))
    .sort((a, b) => (a.weekday as number) - (b.weekday as number));
  if (upcoming.length) return upcoming[0];
  return [...routines].sort((a, b) => (a.weekday as number) - (b.weekday as number))[0];
}

// ---------- workouts ----------

export type Workout = { id: number; routineId: number | null; name: string; startedAt: number; finishedAt: number | null };

export function activeWorkout(): Workout | null {
  return db.getFirstSync<Workout>(
    `SELECT id, routine_id AS routineId, name, started_at AS startedAt, finished_at AS finishedAt
     FROM workouts WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  );
}

export function getWorkout(id: number): Workout | null {
  return db.getFirstSync<Workout>(
    `SELECT id, routine_id AS routineId, name, started_at AS startedAt, finished_at AS finishedAt
     FROM workouts WHERE id = ?`,
    id,
  );
}

export function startWorkout(routineId: number): number {
  const active = activeWorkout();
  if (active) return active.id;
  const routine = getRoutine(routineId);
  const r = db.runSync(
    'INSERT INTO workouts (routine_id, name, started_at) VALUES (?, ?, ?)',
    routineId,
    routine?.name ?? 'Workout',
    Date.now(),
  );
  notify();
  return r.lastInsertRowId;
}

export function finishWorkout(id: number) {
  const count = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM sets WHERE workout_id = ?', id)?.n ?? 0;
  if (count === 0) db.runSync('DELETE FROM workouts WHERE id = ?', id);
  else db.runSync('UPDATE workouts SET finished_at = ? WHERE id = ?', Date.now(), id);
  notify();
}

export type LoggedSet = { id: number; exerciseId: number; setIndex: number; kg: number; reps: number; doneAt: number };

export function workoutSets(workoutId: number): LoggedSet[] {
  return db.getAllSync<LoggedSet>(
    `SELECT id, exercise_id AS exerciseId, set_index AS setIndex, kg, reps, done_at AS doneAt
     FROM sets WHERE workout_id = ? ORDER BY done_at`,
    workoutId,
  );
}

export function logSet(workoutId: number, exerciseId: number, kg: number, reps: number): number {
  const n =
    db.getFirstSync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM sets WHERE workout_id = ? AND exercise_id = ?',
      workoutId,
      exerciseId,
    )?.n ?? 0;
  const r = db.runSync(
    'INSERT INTO sets (workout_id, exercise_id, set_index, kg, reps, done_at) VALUES (?, ?, ?, ?, ?, ?)',
    workoutId,
    exerciseId,
    n + 1,
    kg,
    reps,
    Date.now(),
  );
  notify();
  return r.lastInsertRowId;
}

export function deleteSet(id: number): Undo {
  const rows = take('sets', 'id = ?', id);
  db.runSync('DELETE FROM sets WHERE id = ?', id);
  notify();
  return restorer('sets', rows);
}

/** Heaviest weight ever logged for an exercise, finished workouts and the current one alike. */
export function bestKg(exerciseId: number): number | null {
  return db.getFirstSync<{ kg: number | null }>('SELECT MAX(kg) AS kg FROM sets WHERE exercise_id = ?', exerciseId)?.kg ?? null;
}

export type WorkoutSummary = {
  ms: number;
  sets: number;
  volume: number;
  planned: number;
  completed: number;
  skipped: string[];
  best: { name: string; kg: number; reps: number } | null;
};

export function workoutSummary(id: number): WorkoutSummary | null {
  const w = getWorkout(id);
  if (!w) return null;
  const sets = workoutSets(id);
  const plan = w.routineId ? getPlanItems(w.routineId) : [];
  const count = (exId: number) => sets.filter((s) => s.exerciseId === exId).length;
  // The first new best in plan order is the one worth mentioning.
  let best: WorkoutSummary['best'] = null;
  const exerciseIds = [...new Set([...plan.map((p) => p.exerciseId), ...sets.map((s) => s.exerciseId)])];
  for (const exId of exerciseIds) {
    const mine = sets.filter((s) => s.exerciseId === exId);
    if (!mine.length) continue;
    const top = mine.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
    const before = db.getFirstSync<{ kg: number | null }>(
      `SELECT MAX(s.kg) AS kg FROM sets s JOIN workouts x ON x.id = s.workout_id
       WHERE s.exercise_id = ? AND x.id != ? AND x.finished_at IS NOT NULL`,
      exId,
      id,
    )?.kg;
    if (before != null && top.kg > before) {
      const name = db.getFirstSync<{ name: string }>('SELECT name FROM exercises WHERE id = ?', exId)?.name ?? '';
      best = { name, kg: top.kg, reps: top.reps };
      break;
    }
  }
  return {
    ms: (w.finishedAt ?? Date.now()) - w.startedAt,
    sets: sets.length,
    volume: sets.reduce((v, s) => v + s.kg * s.reps, 0),
    planned: plan.length,
    completed: plan.filter((p) => count(p.exerciseId) >= p.sets).length,
    skipped: plan.filter((p) => count(p.exerciseId) === 0).map((p) => p.name),
    best,
  };
}

/** The last set logged in a workout, for the error screen's "nothing was lost" card. */
export function lastLoggedSet(workoutId: number) {
  return db.getFirstSync<{ name: string; kg: number; reps: number; exercises: number }>(
    `SELECT e.name, s.kg, s.reps,
            (SELECT COUNT(DISTINCT exercise_id) FROM sets WHERE workout_id = s.workout_id) AS exercises
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_id = ? ORDER BY s.done_at DESC LIMIT 1`,
    workoutId,
  );
}

// ---------- streak ----------

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A day counts when anything was logged: a finished workout, food, or a ticked supplement or task.
 * `before` is the run up to yesterday, so the opening can count it up to include today.
 */
export function activityStreak() {
  const since = new Date();
  since.setDate(since.getDate() - 400);
  const from = dayKey(since);
  const active = new Set(
    db
      .getAllSync<{ day: string }>('SELECT day FROM food_entries WHERE day >= ? UNION SELECT day FROM habit_logs WHERE day >= ?', from, from)
      .map((r) => r.day),
  );
  for (const w of db.getAllSync<{ t: number }>(
    'SELECT started_at AS t FROM workouts WHERE finished_at IS NOT NULL AND started_at >= ?',
    since.getTime(),
  )) {
    active.add(dayKey(new Date(w.t)));
  }
  const today = new Date();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  let before = 0;
  while (active.has(dayKey(d))) {
    before++;
    d.setDate(d.getDate() - 1);
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(today);
    x.setDate(x.getDate() - (6 - i));
    return { label: LETTERS[x.getDay()], active: active.has(dayKey(x)), today: i === 6 };
  });
  const todayActive = active.has(dayKey(today));
  return { before, today: todayActive, streak: before + (todayActive ? 1 : 0), days };
}

/** Sets from the most recent finished workout that included this exercise. */
export function lastPerformance(exerciseId: number, excludeWorkoutId?: number): LoggedSet[] {
  const w = db.getFirstSync<{ id: number }>(
    `SELECT w.id FROM workouts w JOIN sets s ON s.workout_id = w.id
     WHERE s.exercise_id = ? AND w.finished_at IS NOT NULL AND w.id != ?
     ORDER BY w.started_at DESC LIMIT 1`,
    exerciseId,
    excludeWorkoutId ?? -1,
  );
  if (!w) return [];
  return db.getAllSync<LoggedSet>(
    `SELECT id, exercise_id AS exerciseId, set_index AS setIndex, kg, reps, done_at AS doneAt
     FROM sets WHERE workout_id = ? AND exercise_id = ? ORDER BY set_index`,
    w.id,
    exerciseId,
  );
}

/** Double progression: every planned set hit the top of the range last time → add one step. */
export function progression(item: PlanItem, last: LoggedSet[], step: number) {
  if (!last.length) return null;
  const topKg = Math.max(...last.map((s) => s.kg));
  const atTop = last.filter((s) => s.kg >= topKg && s.reps >= item.repMax).length;
  return { ready: atTop >= item.sets, topKg, nextKg: topKg + step };
}

export type WeekWorkout = { id: number; routineId: number | null; name: string; weekday: number };

export function weekWorkouts(): WeekWorkout[] {
  const from = startOfWeek().getTime();
  const rows = db.getAllSync<{ id: number; routineId: number | null; name: string; startedAt: number }>(
    `SELECT id, routine_id AS routineId, name, started_at AS startedAt FROM workouts
     WHERE finished_at IS NOT NULL AND started_at >= ? ORDER BY started_at`,
    from,
  );
  return rows.map((r) => ({ ...r, weekday: isoWeekday(new Date(r.startedAt)) }));
}

export type HistoryRow = { id: number; name: string; startedAt: number; finishedAt: number; volume: number; sets: number };

export function history(limit = 30): HistoryRow[] {
  return db.getAllSync<HistoryRow>(
    `SELECT w.id, w.name, w.started_at AS startedAt, w.finished_at AS finishedAt,
            COALESCE(SUM(s.kg * s.reps), 0) AS volume, COUNT(s.id) AS sets
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     WHERE w.finished_at IS NOT NULL
     GROUP BY w.id ORDER BY w.started_at DESC LIMIT ?`,
    limit,
  );
}

/** Workouts in a history list that set a new best weight on any exercise. */
export function prWorkoutIds(): Set<number> {
  const rows = db.getAllSync<{ workoutId: number; exerciseId: number; kg: number; startedAt: number }>(
    `SELECT s.workout_id AS workoutId, s.exercise_id AS exerciseId, MAX(s.kg) AS kg, w.started_at AS startedAt
     FROM sets s JOIN workouts w ON w.id = s.workout_id WHERE w.finished_at IS NOT NULL
     GROUP BY s.workout_id, s.exercise_id ORDER BY w.started_at`,
  );
  const best = new Map<number, number>();
  const ids = new Set<number>();
  for (const r of rows) {
    const prev = best.get(r.exerciseId);
    if (prev !== undefined && r.kg > prev) ids.add(r.workoutId);
    if (prev === undefined || r.kg > prev) best.set(r.exerciseId, r.kg);
  }
  return ids;
}

export type Best = { exerciseId: number; name: string; kg: number; reps: number; isNew: boolean };

export function exerciseBests(): Best[] {
  const rows = db.getAllSync<{ exerciseId: number; name: string; kg: number; reps: number; doneAt: number }>(
    `SELECT s.exercise_id AS exerciseId, e.name, s.kg, s.reps, s.done_at AS doneAt
     FROM sets s JOIN exercises e ON e.id = s.exercise_id
     JOIN workouts w ON w.id = s.workout_id WHERE w.finished_at IS NOT NULL
     ORDER BY s.kg DESC, s.reps DESC`,
  );
  const seen = new Map<number, Best>();
  const weekAgo = Date.now() - 7 * 86400000;
  for (const r of rows) {
    if (!seen.has(r.exerciseId)) {
      seen.set(r.exerciseId, { exerciseId: r.exerciseId, name: r.name, kg: r.kg, reps: r.reps, isNew: r.doneAt >= weekAgo });
    }
  }
  return [...seen.values()].sort((a, b) => b.kg - a.kg);
}

/** Best weight per week for the exercise you've logged most, for the trend card. */
export function mainLiftTrend(weeks = 6) {
  const top = db.getFirstSync<{ exerciseId: number; name: string }>(
    `SELECT s.exercise_id AS exerciseId, e.name FROM sets s JOIN exercises e ON e.id = s.exercise_id
     JOIN workouts w ON w.id = s.workout_id WHERE w.finished_at IS NOT NULL
     GROUP BY s.exercise_id ORDER BY COUNT(*) DESC LIMIT 1`,
  );
  if (!top) return null;
  const now = startOfWeek().getTime();
  const points: (number | null)[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = now - i * 7 * 86400000;
    const to = from + 7 * 86400000;
    const r = db.getFirstSync<{ kg: number | null }>(
      `SELECT MAX(s.kg) AS kg FROM sets s JOIN workouts w ON w.id = s.workout_id
       WHERE w.finished_at IS NOT NULL AND s.exercise_id = ? AND s.done_at >= ? AND s.done_at < ?`,
      top.exerciseId,
      from,
      to,
    );
    points.push(r?.kg ?? null);
  }
  return { name: top.name, points };
}

export function workoutStats(range: 'week' | 'month' | 'year') {
  const now = new Date();
  const from =
    range === 'week'
      ? startOfWeek(now).getTime()
      : range === 'month'
        ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        : new Date(now.getFullYear(), 0, 1).getTime();
  const r = db.getFirstSync<{ n: number; volume: number }>(
    `SELECT COUNT(DISTINCT w.id) AS n, COALESCE(SUM(s.kg * s.reps), 0) AS volume
     FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
     WHERE w.finished_at IS NOT NULL AND w.started_at >= ?`,
    from,
  );
  return { count: r?.n ?? 0, volume: r?.volume ?? 0 };
}

// ---------- food ----------

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

export function mealForNow(d: Date = new Date()): Meal {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

export type FoodEntry = { id: number; meal: Meal; name: string; kcal: number; protein: number; carbs: number; fat: number };

export function foodForDay(day = dayKey()): FoodEntry[] {
  return db.getAllSync<FoodEntry>(
    'SELECT id, meal, name, kcal, protein, carbs, fat FROM food_entries WHERE day = ? ORDER BY created_at',
    day,
  );
}

export function totalsFor(entries: FoodEntry[]) {
  return entries.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function addFood(f: Omit<FoodEntry, 'id'>, day = dayKey()): number {
  const r = db.runSync(
    'INSERT INTO food_entries (day, meal, name, kcal, protein, carbs, fat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    day,
    f.meal,
    f.name,
    Math.round(f.kcal),
    f.protein,
    f.carbs,
    f.fat,
    Date.now(),
  );
  notify();
  return r.lastInsertRowId;
}

export function deleteFood(id: number): Undo {
  const rows = take('food_entries', 'id = ?', id);
  db.runSync('DELETE FROM food_entries WHERE id = ?', id);
  notify();
  return restorer('food_entries', rows);
}

export type Preset = { id: number; name: string; detail: string; kcal: number; protein: number; carbs: number; fat: number };

export function presets(search = ''): Preset[] {
  return db.getAllSync<Preset>(
    `SELECT id, name, detail, kcal, protein, carbs, fat FROM food_presets
     WHERE name LIKE ? ORDER BY last_used DESC, id LIMIT 30`,
    `%${search}%`,
  );
}

export function addPreset(p: Preset, meal: Meal): number {
  const id = addFood({ meal, name: p.name, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat });
  db.runSync('UPDATE food_presets SET last_used = ? WHERE id = ?', Date.now(), p.id);
  notify();
  return id;
}

export function savePreset(p: Omit<Preset, 'id'>) {
  db.runSync(
    'INSERT INTO food_presets (name, detail, kcal, protein, carbs, fat, last_used) VALUES (?, ?, ?, ?, ?, ?, ?)',
    p.name,
    p.detail,
    p.kcal,
    p.protein,
    p.carbs,
    p.fat,
    Date.now(),
  );
  notify();
}

// ---------- habits (supplements and daily tasks) ----------

export type Habit = { id: number; kind: 'supplement' | 'task'; title: string; dose: string; done: boolean; streak: number };

export function habitsForDay(day = dayKey(), kind?: 'supplement' | 'task'): Habit[] {
  const rows = db.getAllSync<{ id: number; kind: 'supplement' | 'task'; title: string; dose: string; done: number }>(
    `SELECT h.id, h.kind, h.title, h.dose, EXISTS(SELECT 1 FROM habit_logs l WHERE l.habit_id = h.id AND l.day = ?) AS done
     FROM habits h WHERE h.archived = 0 ${kind ? 'AND h.kind = ?' : ''} ORDER BY h.kind DESC, h.position`,
    ...(kind ? [day, kind] : [day]),
  );
  return rows.map((r) => ({ ...r, done: !!r.done, streak: habitStreak(r.id) }));
}

export function habitStreak(habitId: number): number {
  const days = new Set(
    db.getAllSync<{ day: string }>('SELECT day FROM habit_logs WHERE habit_id = ? ORDER BY day DESC LIMIT 400', habitId).map(
      (r) => r.day,
    ),
  );
  const d = new Date();
  // A streak survives until the end of today even if today isn't ticked yet.
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function toggleHabit(habitId: number, day = dayKey()) {
  const exists = db.getFirstSync('SELECT 1 FROM habit_logs WHERE habit_id = ? AND day = ?', habitId, day);
  if (exists) db.runSync('DELETE FROM habit_logs WHERE habit_id = ? AND day = ?', habitId, day);
  else db.runSync('INSERT INTO habit_logs (habit_id, day, done_at) VALUES (?, ?, ?)', habitId, day, Date.now());
  notify();
  return !exists;
}

// ---------- bodyweight ----------

export function logWeight(kg: number, day = dayKey()) {
  db.runSync('INSERT INTO bodyweight (day, kg) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET kg = excluded.kg', day, kg);
  notify();
}

export function weightSummary() {
  const rows = db.getAllSync<{ day: string; kg: number }>('SELECT day, kg FROM bodyweight ORDER BY day DESC LIMIT 60');
  if (!rows.length) return null;
  const latest = rows[0];
  const t = new Date(latest.day + 'T00:00:00').getTime();
  const avg = (from: number, to: number) => {
    const xs = rows.filter((r) => {
      const x = new Date(r.day + 'T00:00:00').getTime();
      return x > t - to * 86400000 && x <= t - from * 86400000;
    });
    return xs.length ? xs.reduce((s, r) => s + r.kg, 0) / xs.length : null;
  };
  const thisWeek = avg(0, 7);
  const lastWeek = avg(7, 14);
  const perWeek = thisWeek != null && lastWeek != null ? thisWeek - lastWeek : null;
  return { latest: latest.kg, day: latest.day, perWeek };
}

// ---------- editing routines ----------

export function createRoutine(name = 'New routine'): number {
  const pos = db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM routines')?.n ?? 0;
  const r = db.runSync('INSERT INTO routines (name, focus, weekday, position) VALUES (?, ?, NULL, ?)', name, '', pos);
  notify();
  return r.lastInsertRowId;
}

export function renameRoutine(id: number, name: string) {
  db.runSync('UPDATE routines SET name = ? WHERE id = ?', name.trim() || 'Untitled', id);
  notify();
}

/** One routine per weekday: taking a day frees it from whichever routine had it. */
export function setRoutineDay(id: number, weekday: number | null) {
  db.withTransactionSync(() => {
    if (weekday != null) db.runSync('UPDATE routines SET weekday = NULL WHERE weekday = ? AND id != ?', weekday, id);
    db.runSync('UPDATE routines SET weekday = ? WHERE id = ?', weekday, id);
  });
  notify();
}

export function deleteRoutine(id: number): Undo {
  const routine = take('routines', 'id = ?', id);
  const items = take('routine_exercises', 'routine_id = ?', id);
  const linked = db.getAllSync<{ id: number }>('SELECT id FROM workouts WHERE routine_id = ?', id);
  db.withTransactionSync(() => {
    db.runSync('UPDATE workouts SET routine_id = NULL WHERE routine_id = ?', id);
    db.runSync('DELETE FROM routines WHERE id = ?', id);
  });
  notify();
  return () => {
    db.withTransactionSync(() => {
      // Keep one routine per weekday: if the day was taken meanwhile, come back unscheduled.
      const r = routine.map((row) =>
        row.weekday != null && db.getFirstSync('SELECT 1 FROM routines WHERE weekday = ?', row.weekday) ? { ...row, weekday: null } : row,
      );
      put('routines', r);
      put('routine_exercises', items);
      for (const w of linked) db.runSync('UPDATE workouts SET routine_id = ? WHERE id = ?', id, w.id);
    });
    notify();
  };
}

export type Exercise = { id: number; name: string };

export function listExercises(search = ''): Exercise[] {
  return db.getAllSync<Exercise>('SELECT id, name FROM exercises WHERE name LIKE ? ORDER BY name', `%${search}%`);
}

export function createExercise(name: string): number {
  const clean = name.trim();
  const existing = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE', clean);
  if (existing) return existing.id;
  const r = db.runSync('INSERT INTO exercises (name) VALUES (?)', clean);
  notify();
  return r.lastInsertRowId;
}

export function addToRoutine(routineId: number, exerciseId: number) {
  const pos =
    db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM routine_exercises WHERE routine_id = ?', routineId)?.n ?? 0;
  db.runSync(
    'INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, rep_min, rep_max, rest_sec) VALUES (?, ?, ?, 3, 8, 12, 90)',
    routineId,
    exerciseId,
    pos,
  );
  notify();
}

export function updatePlanItem(id: number, patch: { sets?: number; repMin?: number; repMax?: number; restSec?: number }) {
  const cur = db.getFirstSync<{ sets: number; rep_min: number; rep_max: number; rest_sec: number }>(
    'SELECT sets, rep_min, rep_max, rest_sec FROM routine_exercises WHERE id = ?',
    id,
  );
  if (!cur) return;
  const sets = Math.min(10, Math.max(1, patch.sets ?? cur.sets));
  let repMin = Math.min(50, Math.max(1, patch.repMin ?? cur.rep_min));
  let repMax = Math.min(50, Math.max(1, patch.repMax ?? cur.rep_max));
  if (patch.repMin != null && repMin > repMax) repMax = repMin;
  if (patch.repMax != null && repMax < repMin) repMin = repMax;
  const restSec = Math.min(600, Math.max(15, patch.restSec ?? cur.rest_sec));
  db.runSync('UPDATE routine_exercises SET sets = ?, rep_min = ?, rep_max = ?, rest_sec = ? WHERE id = ?', sets, repMin, repMax, restSec, id);
  notify();
}

export function removePlanItem(id: number): Undo {
  const rows = take('routine_exercises', 'id = ?', id);
  db.runSync('DELETE FROM routine_exercises WHERE id = ?', id);
  notify();
  return restorer('routine_exercises', rows);
}

export function movePlanItem(routineId: number, id: number, dir: -1 | 1) {
  const items = getPlanItems(routineId);
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  db.withTransactionSync(() => {
    items.forEach((x, pos) => db.runSync('UPDATE routine_exercises SET position = ? WHERE id = ?', pos, x.id));
  });
  notify();
}

/** Pairs an item with the one below it as a superset, or splits it off again. */
export function toggleSuperset(routineId: number, id: number) {
  const items = getPlanItems(routineId);
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  const item = items[i];
  if (item.superset != null) {
    db.runSync('UPDATE routine_exercises SET superset = NULL WHERE routine_id = ? AND superset = ?', routineId, item.superset);
  } else if (items[i + 1]) {
    const next = (db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(superset), 0) + 1 AS n FROM routine_exercises WHERE routine_id = ?', routineId)?.n) ?? 1;
    db.runSync('UPDATE routine_exercises SET superset = ? WHERE id IN (?, ?)', next, item.id, items[i + 1].id);
  }
  notify();
}
