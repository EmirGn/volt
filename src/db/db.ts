import * as SQLite from 'expo-sqlite';
import { seed } from './seed';

// Everything lives on the phone. One database, opened once, migrated by user_version.
export const db = SQLite.openDatabaseSync('volt.db');

const MIGRATIONS: string[] = [
  `
  PRAGMA foreign_keys = ON;
  CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    tip TEXT
  );
  CREATE TABLE routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    focus TEXT NOT NULL DEFAULT '',
    weekday INTEGER,            -- 1 = Monday … 7 = Sunday, null = unscheduled
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    position INTEGER NOT NULL,
    sets INTEGER NOT NULL,
    rep_min INTEGER NOT NULL,
    rep_max INTEGER NOT NULL,
    rest_sec INTEGER NOT NULL DEFAULT 90,
    superset INTEGER            -- rows sharing a number in one routine are a superset
  );
  CREATE TABLE workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER REFERENCES routines(id),
    name TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER
  );
  CREATE TABLE sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    set_index INTEGER NOT NULL,
    kg REAL NOT NULL,
    reps INTEGER NOT NULL,
    done_at INTEGER NOT NULL
  );
  CREATE INDEX sets_by_exercise ON sets(exercise_id, done_at);
  CREATE TABLE food_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    kcal INTEGER NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    last_used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE food_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    meal TEXT NOT NULL,         -- breakfast | lunch | dinner | snacks
    name TEXT NOT NULL,
    kcal INTEGER NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX food_by_day ON food_entries(day);
  CREATE TABLE habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,         -- supplement | task
    title TEXT NOT NULL,
    dose TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE habit_logs (
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    done_at INTEGER NOT NULL,
    PRIMARY KEY (habit_id, day)
  );
  CREATE TABLE bodyweight (
    day TEXT PRIMARY KEY,
    kg REAL NOT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function migrate() {
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const isFirst = version === 0;
    db.withTransactionSync(() => {
      db.execSync(sql);
      if (isFirst) seed(db);
      db.execSync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}

// Tiny change feed: every write calls notify(), every useData() re-reads.
type Listener = () => void;
const listeners = new Set<Listener>();
let revision = 0;

export function notify() {
  revision++;
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getRevision() {
  return revision;
}
