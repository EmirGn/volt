import type { Client, InStatement, InValue } from '@libsql/client';
import { HttpError } from './db.js';
import { rowObject } from './sql.js';
import { TABLES, TABLE_BY_NAME, TABLE_ORDER, isLocalSetting, type TableDef } from './tables.js';

export type Change = {
  t: string;
  k: string;
  at: number;
  op: 'put' | 'del';
  row?: Record<string, unknown>;
};

export const MAX_CHANGES = 500;

type Valid = {
  def: TableDef;
  k: string;
  pk: InValue[];
  at: number;
  op: 'put' | 'del';
  row?: Record<string, InValue>;
};

const isValue = (v: unknown): v is InValue => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Checks one incoming change against the whitelist. Returns null for anything we won't apply. */
function validate(c: Change): Valid | null {
  if (!c || typeof c !== 'object') return null;
  const def = TABLE_BY_NAME.get(c.t);
  if (!def || (c.op !== 'put' && c.op !== 'del') || typeof c.k !== 'string') return null;
  if (typeof c.at !== 'number' || !Number.isFinite(c.at)) return null;
  let pk: unknown;
  try {
    pk = JSON.parse(c.k);
  } catch {
    return null;
  }
  if (
    !Array.isArray(pk) ||
    pk.length !== def.pk.length ||
    !pk.every((v) => typeof v === 'string' || typeof v === 'number')
  ) {
    return null;
  }
  if (JSON.stringify(pk) !== c.k) return null; // the key text must be canonical
  if (def.name === 'settings' && isLocalSetting(String(pk[0]))) return null;
  if (c.op === 'del') return { def, k: c.k, pk, at: c.at, op: 'del' };
  if (!c.row || typeof c.row !== 'object') return null;
  const row: Record<string, InValue> = {};
  for (const col of def.columns) {
    if (col in c.row && isValue(c.row[col])) row[col] = c.row[col] as InValue;
  }
  def.pk.forEach((col, i) => (row[col] = pk[i])); // the key wins over whatever the row says
  return { def, k: c.k, pk, at: c.at, op: 'put', row };
}

const where = (def: TableDef) => def.pk.map((c) => `${c} = ?`).join(' AND ');

function upsert(def: TableDef, row: Record<string, InValue>): InStatement {
  const cols = Object.keys(row);
  const rest = cols.filter((c) => !def.pk.includes(c));
  const set = rest.length ? `DO UPDATE SET ${rest.map((c) => `${c} = excluded.${c}`).join(', ')}` : 'DO NOTHING';
  return {
    sql: `INSERT INTO ${def.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
          ON CONFLICT (${def.pk.join(', ')}) ${set}`,
    args: cols.map((c) => row[c]),
  };
}

/** Applies a phone's changes, last write wins per row by `at` (ties go to the incoming change). */
export async function push(db: Client, changes: Change[]) {
  if (!Array.isArray(changes)) throw new HttpError(400, '`changes` must be an array');
  if (changes.length > MAX_CHANGES) throw new HttpError(413, `At most ${MAX_CHANGES} changes per push`);

  let skipped = 0;
  // One change per row: the newest wins, a later one in the list wins a tie.
  const latest = new Map<string, Valid>();
  for (const c of changes) {
    const v = validate(c);
    if (!v) {
      skipped++;
      continue;
    }
    const id = `${v.def.name}\u0000${v.k}`;
    const prev = latest.get(id);
    if (prev) skipped++;
    if (!prev || v.at >= prev.at) latest.set(id, v);
  }
  const wanted = [...latest.values()];

  const tx = await db.transaction('write');
  try {
    const stored = new Map<string, number>();
    if (wanted.length) {
      const rs = await tx.execute({
        sql: `SELECT m.tbl, m.k, m.at FROM json_each(?) j
              JOIN _meta m ON m.tbl = json_extract(j.value, '$[0]') AND m.k = json_extract(j.value, '$[1]')`,
        args: [JSON.stringify(wanted.map((v) => [v.def.name, v.k]))],
      });
      for (const r of rs.rows) stored.set(`${r[0]}\u0000${r[1]}`, Number(r[2]));
    }
    const apply = wanted.filter((v) => {
      const at = stored.get(`${v.def.name}\u0000${v.k}`);
      const ok = at === undefined || v.at >= at;
      if (!ok) skipped++;
      return ok;
    });
    // Deletes first, children before parents, so a row deleted and re-added under a unique name can't collide.
    // Then puts, parents first.
    const order = (v: Valid) => TABLE_ORDER.get(v.def.name)!;
    const dels = apply.filter((v) => v.op === 'del').sort((a, b) => order(b) - order(a));
    const puts = apply.filter((v) => v.op === 'put').sort((a, b) => order(a) - order(b));

    const stmts: InStatement[] = [{ sql: 'UPDATE _flag SET applying = 1', args: [] }];
    for (const v of [...dels, ...puts]) {
      if (v.op === 'del') {
        stmts.push({
          sql: `DELETE FROM ${v.def.name} WHERE ${where(v.def)}`,
          args: v.pk,
        });
        for (const [child, col] of v.def.children) {
          stmts.push({
            sql: `DELETE FROM ${child} WHERE ${col} = ?`,
            args: [v.pk[0]],
          });
        }
      } else {
        stmts.push(upsert(v.def, v.row!));
      }
      stmts.push({ sql: 'UPDATE _counter SET n = n + 1', args: [] });
      stmts.push({
        sql: `INSERT INTO _meta (tbl, k, at, deleted, seq) VALUES (?, ?, ?, ?, (SELECT n FROM _counter))
              ON CONFLICT (tbl, k) DO UPDATE SET at = excluded.at, deleted = excluded.deleted, seq = excluded.seq`,
        args: [v.def.name, v.k, Math.round(v.at), v.op === 'del' ? 1 : 0],
      });
    }
    stmts.push({ sql: 'UPDATE _flag SET applying = 0', args: [] });
    stmts.push({ sql: 'SELECT n FROM _counter', args: [] });
    const results = await tx.batch(stmts);
    await tx.commit();
    const seq = Number(results[results.length - 1].rows[0][0]);
    return { applied: apply.length, skipped, seq };
  } finally {
    tx.close();
  }
}

/** Everything that changed after `since`, oldest first, with the current row for each put. */
export async function pull(db: Client, since: number, limit: number) {
  const tx = await db.transaction('read');
  try {
    const metas = await tx.execute({
      sql: 'SELECT tbl, k, at, deleted, seq FROM _meta WHERE seq > ? ORDER BY seq LIMIT ?',
      args: [since, limit + 1],
    });
    const more = metas.rows.length > limit;
    const page = metas.rows.slice(0, limit).map((r) => ({
      t: String(r[0]),
      k: String(r[1]),
      at: Number(r[2]),
      deleted: Number(r[3]) === 1,
      seq: Number(r[4]),
    }));

    // Current rows for the puts, one query per table.
    const rows = new Map<string, Record<string, unknown>>();
    const byTable = new Map<string, string[]>();
    for (const m of page) {
      if (!m.deleted && TABLE_BY_NAME.has(m.t)) byTable.set(m.t, [...(byTable.get(m.t) ?? []), m.k]);
    }
    for (const [t, keys] of byTable) {
      const def = TABLE_BY_NAME.get(t)!;
      const single = def.pk.length === 1;
      const rs = await tx.execute({
        sql: single
          ? `SELECT * FROM ${t} WHERE ${def.pk[0]} IN (SELECT value FROM json_each(?))`
          : `SELECT * FROM ${t} WHERE json_array(${def.pk.join(', ')}) IN (SELECT value FROM json_each(?))`,
        args: [JSON.stringify(single ? keys.map((k) => JSON.parse(k)[0]) : keys)],
      });
      for (const r of rs.rows) {
        const o = rowObject(rs, r);
        rows.set(`${t}\u0000${JSON.stringify(def.pk.map((c) => o[c]))}`, o);
      }
    }

    const changes: Change[] = [];
    for (const m of page) {
      if (!TABLE_BY_NAME.has(m.t)) continue;
      if (m.t === 'settings' && isLocalSetting(String(JSON.parse(m.k)[0]))) continue;
      const row = m.deleted ? undefined : rows.get(`${m.t}\u0000${m.k}`);
      // A put whose row is gone was removed without a record (a push's cascade): tell the phone it's deleted.
      changes.push(row ? { t: m.t, k: m.k, at: m.at, op: 'put', row } : { t: m.t, k: m.k, at: m.at, op: 'del' });
    }

    let seq: number;
    if (more) seq = page[page.length - 1].seq;
    else seq = Number((await tx.execute('SELECT n FROM _counter')).rows[0][0]);
    await tx.commit();
    return { changes, seq, more };
  } finally {
    tx.close();
  }
}

export async function health(db: Client) {
  const counts = TABLES.map((t) => `(SELECT COUNT(*) FROM ${t.name}) AS ${t.name}`).join(', ');
  const rs = await db.execute(`SELECT (SELECT n FROM _counter) AS seq, ${counts}`);
  const o = rowObject(rs, rs.rows[0]);
  const { seq, ...rows } = o;
  return { ok: true, seq: Number(seq), rows };
}

export async function schema(db: Client) {
  const results = await db.batch(
    TABLES.map((t) => `PRAGMA table_info(${t.name})`),
    'read',
  );
  return {
    tables: TABLES.map((t, i) => ({
      name: t.name,
      columns: results[i].rows.map((r) => ({
        name: String(r[1]),
        type: String(r[2]),
        notnull: Number(r[3]) === 1,
        pk: Number(r[5]),
      })),
    })),
  };
}
