// Synced tables, in parent-first order. Mirrors src/sync/tables.ts on the phone (and the app's migration 1 in
// src/db/db.ts): if a table or column changes there, change it here and in schema.ts too.

export type TableDef = {
  name: string;
  /** Primary key columns, in key order. A row's key is JSON.stringify(pk values). */
  pk: string[];
  /** Every column, pk included. Anything else in an incoming row is dropped. */
  columns: string[];
  /** Child tables deleted with a row of this one: [child table, child column that holds our id]. */
  children: [string, string][];
};

export const TABLES: TableDef[] = [
  {
    name: 'exercises',
    pk: ['id'],
    columns: ['id', 'name', 'tip'],
    children: [],
  },
  {
    name: 'routines',
    pk: ['id'],
    columns: ['id', 'name', 'focus', 'weekday', 'position'],
    children: [['routine_exercises', 'routine_id']],
  },
  {
    name: 'routine_exercises',
    pk: ['id'],
    columns: ['id', 'routine_id', 'exercise_id', 'position', 'sets', 'rep_min', 'rep_max', 'rest_sec', 'superset'],
    children: [],
  },
  {
    name: 'workouts',
    pk: ['id'],
    columns: ['id', 'routine_id', 'name', 'started_at', 'finished_at'],
    children: [['sets', 'workout_id']],
  },
  {
    name: 'sets',
    pk: ['id'],
    columns: ['id', 'workout_id', 'exercise_id', 'set_index', 'kg', 'reps', 'done_at'],
    children: [],
  },
  {
    name: 'food_presets',
    pk: ['id'],
    columns: ['id', 'name', 'detail', 'kcal', 'protein', 'carbs', 'fat', 'last_used'],
    children: [],
  },
  {
    name: 'food_entries',
    pk: ['id'],
    columns: ['id', 'day', 'meal', 'name', 'kcal', 'protein', 'carbs', 'fat', 'created_at'],
    children: [],
  },
  {
    name: 'habits',
    pk: ['id'],
    columns: ['id', 'kind', 'title', 'dose', 'position', 'archived'],
    children: [['habit_logs', 'habit_id']],
  },
  {
    name: 'habit_logs',
    pk: ['habit_id', 'day'],
    columns: ['habit_id', 'day', 'done_at'],
    children: [],
  },
  { name: 'bodyweight', pk: ['day'], columns: ['day', 'kg'], children: [] },
  { name: 'settings', pk: ['key'], columns: ['key', 'value'], children: [] },
];

export const TABLE_BY_NAME = new Map(TABLES.map((t) => [t.name, t]));
export const TABLE_ORDER = new Map(TABLES.map((t, i) => [t.name, i]));

/** Settings that belong to one device and never sync. */
export const LOCAL_SETTINGS = ['notifications_asked'];
export const LOCAL_SETTING_PREFIXES = ['hub_', 'local_'];

export function isLocalSetting(key: string) {
  return LOCAL_SETTINGS.includes(key) || LOCAL_SETTING_PREFIXES.some((p) => key.startsWith(p));
}

/** The text key of a row: JSON.stringify of its pk values, e.g. `[1760000000000123]` or `[3,"2026-10-22"]`. */
export function keyOf(t: TableDef, row: Record<string, unknown>) {
  return JSON.stringify(t.pk.map((c) => row[c]));
}
