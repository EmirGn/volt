// What syncs with the hub, and the SQL that tracks it. No imports on purpose: plain data and strings.

export type SyncTable = {
  name: string;
  /** Primary key columns, in key order. */
  pk: string[];
  /** Rows deleted together with this one: child table and its column pointing here. */
  children?: { table: string; column: string }[];
};

/** Parent-first order (HUB.md, "Synced tables"). Puts go in this order, deletes in reverse. */
export const TABLES: SyncTable[] = [
  { name: 'exercises', pk: ['id'] },
  { name: 'routines', pk: ['id'], children: [{ table: 'routine_exercises', column: 'routine_id' }] },
  { name: 'routine_exercises', pk: ['id'] },
  { name: 'workouts', pk: ['id'], children: [{ table: 'sets', column: 'workout_id' }] },
  { name: 'sets', pk: ['id'] },
  { name: 'food_presets', pk: ['id'] },
  { name: 'food_entries', pk: ['id'] },
  { name: 'habits', pk: ['id'], children: [{ table: 'habit_logs', column: 'habit_id' }] },
  { name: 'habit_logs', pk: ['habit_id', 'day'] },
  { name: 'bodyweight', pk: ['day'] },
  { name: 'settings', pk: ['key'] },
];

export const TABLE_BY_NAME = new Map(TABLES.map((t) => [t.name, t]));
export const TABLE_RANK = new Map(TABLES.map((t, i) => [t.name, i]));

/** Settings that stay on this phone. */
export const LOCAL_SETTINGS = ['notifications_asked'];
export const LOCAL_SETTING_PREFIXES = ['hub_', 'local_'];

export function isLocalSetting(key: string) {
  return LOCAL_SETTINGS.includes(key) || LOCAL_SETTING_PREFIXES.some((p) => key.startsWith(p));
}

/** A row's key as text, e.g. `[1760000000000123]` or `[3,"2026-10-22"]`. Same as SQLite's json_array(). */
export function keyOf(values: unknown[]) {
  return JSON.stringify(values);
}

// ---------- SQL ----------

const NOW = `CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function keyExpr(t: SyncTable, ref: string) {
  return `json_array(${t.pk.map((c) => `${ref}${c}`).join(', ')})`;
}

/** SQL condition that is true when the row should sync (only settings have local rows). */
function syncsExpr(t: SyncTable, ref: string) {
  if (t.name !== 'settings') return '1';
  const key = `${ref}key`;
  return [
    ...LOCAL_SETTINGS.map((k) => `${key} != ${q(k)}`),
    ...LOCAL_SETTING_PREFIXES.map((p) => `substr(${key}, 1, ${p.length}) != ${q(p)}`),
  ].join(' AND ');
}

function record(t: SyncTable, ref: 'NEW.' | 'OLD.', op: 'put' | 'del', extra = '') {
  return `INSERT INTO _changes (tbl, k, at, op, pushed)
      SELECT ${q(t.name)}, ${keyExpr(t, ref)}, ${NOW}, '${op}', 0 WHERE ${syncsExpr(t, ref)}${extra}
      ON CONFLICT(tbl, k) DO UPDATE SET at = excluded.at, op = excluded.op, pushed = 0;`;
}

/** AFTER INSERT/UPDATE/DELETE triggers that version every local write in `_changes`. */
export function triggersSql(t: SyncTable) {
  const when = `WHEN (SELECT applying FROM _flag) = 0`;
  return `
  CREATE TRIGGER _sync_${t.name}_ins AFTER INSERT ON ${t.name} ${when} BEGIN
    ${record(t, 'NEW.', 'put')}
  END;
  CREATE TRIGGER _sync_${t.name}_upd AFTER UPDATE ON ${t.name} ${when} BEGIN
    ${record(t, 'OLD.', 'del', ` AND ${keyExpr(t, 'OLD.')} != ${keyExpr(t, 'NEW.')}`)}
    ${record(t, 'NEW.', 'put')}
  END;
  CREATE TRIGGER _sync_${t.name}_del AFTER DELETE ON ${t.name} ${when} BEGIN
    ${record(t, 'OLD.', 'del')}
  END;`;
}

/** Every existing row goes up on the first push, with `at = 1` so any real edit wins against it. */
export function backfillSql(t: SyncTable) {
  return `
  INSERT INTO _changes (tbl, k, at, op, pushed)
    SELECT ${q(t.name)}, ${keyExpr(t, '')}, 1, 'put', 0 FROM ${t.name} WHERE ${syncsExpr(t, '')}
    ON CONFLICT(tbl, k) DO NOTHING;`;
}

/**
 * Migration 2. Frozen once shipped: a table added to TABLES later needs a new migration with its own
 * triggersSql() and backfillSql(), never an edit here.
 */
export function syncMigrationSql(tables: SyncTable[] = TABLES) {
  return `
  CREATE TABLE _changes (
    tbl TEXT NOT NULL,
    k TEXT NOT NULL,
    at INTEGER NOT NULL,
    op TEXT NOT NULL,           -- put | del
    pushed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tbl, k)
  );
  CREATE INDEX _changes_unpushed ON _changes(pushed);
  CREATE TABLE _sync (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE _flag (
    applying INTEGER NOT NULL
  );
  INSERT INTO _flag (applying) VALUES (0);
  ${tables.map(triggersSql).join('\n')}
  ${tables.map(backfillSql).join('\n')}
  `;
}
