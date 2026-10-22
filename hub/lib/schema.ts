import type { Client } from '@libsql/client';
import { TABLES, LOCAL_SETTINGS, LOCAL_SETTING_PREFIXES, type TableDef } from './tables.js';

// The app's tables (migration 1 in src/db/db.ts), with two deliberate differences:
//  - No REFERENCES clauses. A push may carry a child before its parent (batches of 500), and `PRAGMA foreign_keys`
//    is a no-op inside a transaction anyway. Cascades are done by the triggers below instead.
//  - Same columns, types, NOT NULLs, defaults and the UNIQUE on exercises.name, so the hub never holds a row the
//    phone couldn't.
const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    tip TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    focus TEXT NOT NULL DEFAULT '',
    weekday INTEGER,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    sets INTEGER NOT NULL,
    rep_min INTEGER NOT NULL,
    rep_max INTEGER NOT NULL,
    rest_sec INTEGER NOT NULL DEFAULT 90,
    superset INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER,
    name TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    set_index INTEGER NOT NULL,
    kg REAL NOT NULL,
    reps INTEGER NOT NULL,
    done_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sets_by_exercise ON sets(exercise_id, done_at)`,
  `CREATE INDEX IF NOT EXISTS sets_by_workout ON sets(workout_id)`,
  `CREATE TABLE IF NOT EXISTS food_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    kcal INTEGER NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    last_used INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS food_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    meal TEXT NOT NULL,
    name TEXT NOT NULL,
    kcal INTEGER NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS food_by_day ON food_entries(day)`,
  `CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    dose TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS habit_logs (
    habit_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    done_at INTEGER NOT NULL,
    PRIMARY KEY (habit_id, day)
  )`,
  `CREATE TABLE IF NOT EXISTS bodyweight (
    day TEXT PRIMARY KEY,
    kg REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

const SYNC_DDL = [
  `CREATE TABLE IF NOT EXISTS _meta (
    tbl TEXT NOT NULL,
    k TEXT NOT NULL,
    at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    seq INTEGER NOT NULL,
    PRIMARY KEY (tbl, k)
  )`,
  `CREATE INDEX IF NOT EXISTS _meta_by_seq ON _meta(seq)`,
  `CREATE TABLE IF NOT EXISTS _counter (n INTEGER NOT NULL)`,
  `INSERT INTO _counter (n) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM _counter)`,
  `CREATE TABLE IF NOT EXISTS _flag (applying INTEGER NOT NULL)`,
  `INSERT INTO _flag (applying) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM _flag)`,
  // A push always resets it before committing, so a stray 1 can only be left by hand. Clear it on cold start.
  `UPDATE _flag SET applying = 0 WHERE applying != 0`,
];

/** Milliseconds since epoch, in SQL. */
export const NOW_MS = `CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;
const APPLYING = `(SELECT applying FROM _flag) = 0`;

const keyExpr = (t: TableDef, ref: 'NEW' | 'OLD') => `json_array(${t.pk.map((c) => `${ref}.${c}`).join(', ')})`;

function syncedSetting(ref: 'NEW' | 'OLD') {
  const exact = LOCAL_SETTINGS.map((k) => `${ref}.key != '${k}'`);
  const prefixed = LOCAL_SETTING_PREFIXES.map((p) => `substr(${ref}.key, 1, ${p.length}) != '${p}'`);
  return [...exact, ...prefixed].join(' AND ');
}

/** Bump the counter, then record the row's new version in _meta. */
function record(t: TableDef, ref: 'NEW' | 'OLD', deleted: 0 | 1, onlyIf?: string) {
  return `
    UPDATE _counter SET n = n + 1${onlyIf ? ` WHERE ${onlyIf}` : ''};
    INSERT INTO _meta (tbl, k, at, deleted, seq)
      SELECT '${t.name}', ${keyExpr(t, ref)}, ${NOW_MS}, ${deleted}, (SELECT n FROM _counter)
      WHERE ${onlyIf ?? '1'}
      ON CONFLICT (tbl, k) DO UPDATE SET at = excluded.at, deleted = excluded.deleted, seq = excluded.seq;`;
}

function changeTriggers(t: TableDef) {
  const when = (ref: 'NEW' | 'OLD') => (t.name === 'settings' ? `${APPLYING} AND ${syncedSetting(ref)}` : APPLYING);
  // An UPDATE that changes the key is a delete of the old key plus a put of the new one.
  const keyChanged = `${keyExpr(t, 'OLD')} != ${keyExpr(t, 'NEW')}`;
  return [
    `CREATE TRIGGER IF NOT EXISTS _sync_${t.name}_ins AFTER INSERT ON ${t.name} WHEN ${when('NEW')}
     BEGIN ${record(t, 'NEW', 0)} END`,
    `CREATE TRIGGER IF NOT EXISTS _sync_${t.name}_upd AFTER UPDATE ON ${t.name} WHEN ${when('NEW')}
     BEGIN ${record(t, 'OLD', 1, keyChanged)} ${record(t, 'NEW', 0)} END`,
    `CREATE TRIGGER IF NOT EXISTS _sync_${t.name}_del AFTER DELETE ON ${t.name} WHEN ${when('OLD')}
     BEGIN ${record(t, 'OLD', 1)} END`,
  ];
}

// Cascades, the way the app does them. These fire for /api/exec (where the children's own change triggers then
// record their deletes, so the phone hears about them) and during a push (where `applying = 1` keeps them quiet;
// the phone already deleted the children itself).
const CASCADE_DDL = [
  `CREATE TRIGGER IF NOT EXISTS _cascade_routines AFTER DELETE ON routines BEGIN
     DELETE FROM routine_exercises WHERE routine_id = OLD.id;
     UPDATE workouts SET routine_id = NULL WHERE routine_id = OLD.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS _cascade_workouts AFTER DELETE ON workouts BEGIN
     DELETE FROM sets WHERE workout_id = OLD.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS _cascade_habits AFTER DELETE ON habits BEGIN
     DELETE FROM habit_logs WHERE habit_id = OLD.id;
   END`,
  // The app's foreign keys refuse to delete an exercise that sets or routines still use. Do the same for exec.
  `CREATE TRIGGER IF NOT EXISTS _guard_exercises BEFORE DELETE ON exercises WHEN ${APPLYING} AND (
     EXISTS (SELECT 1 FROM sets WHERE exercise_id = OLD.id) OR
     EXISTS (SELECT 1 FROM routine_exercises WHERE exercise_id = OLD.id))
   BEGIN SELECT RAISE(ABORT, 'exercise is still used by sets or routines'); END`,
];

export const SCHEMA_STATEMENTS = [...TABLE_DDL, ...SYNC_DDL, ...TABLES.flatMap(changeTriggers), ...CASCADE_DDL];

let ready: Promise<void> | null = null;

/** Idempotent. Runs once per cold start (per client); a failure is retried on the next request. */
export function ensureSchema(client: Client): Promise<void> {
  if (!ready) {
    ready = client
      .batch(SCHEMA_STATEMENTS, 'write')
      .then(() => undefined)
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

export function resetSchemaCache() {
  ready = null;
}
