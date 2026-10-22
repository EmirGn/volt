// Runs the hub's route handlers directly against a throwaway file: database.
// cd hub && npm test   (node --import ./test/register.mjs --test test/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'volt-hub-test-'));
process.env.VOLT_DB_URL = `file:${join(dir, 'hub.db')}`;
process.env.VOLT_TOKEN = 'test-token';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const health = await import('../api/health.ts');
const schema = await import('../api/schema.ts');
const pushRoute = await import('../api/sync/push.ts');
const pullRoute = await import('../api/sync/pull.ts');
const query = await import('../api/query.ts');
const exec = await import('../api/exec.ts');
const { resetDb } = await import('../lib/db.ts');

async function call(fn, method, path, body, token = 'test-token') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fn(
    new Request(`http://hub.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }),
  );
  return { status: res.status, body: await res.json() };
}

const push = (changes) => call(pushRoute.POST, 'POST', '/api/sync/push', { changes });
const pull = (since = 0, limit = 500) => call(pullRoute.GET, 'GET', `/api/sync/pull?since=${since}&limit=${limit}`);
const sql = async (s, args) => {
  const r = await call(query.POST, 'POST', '/api/query', { sql: s, args });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.rows.map((row) => Object.fromEntries(r.body.columns.map((c, i) => [c, row[i]])));
};
const run = (...statements) => call(exec.POST, 'POST', '/api/exec', { statements });
const key = (...v) => JSON.stringify(v);
const put = (t, row, k, at) => ({ t, k, at, op: 'put', row });
const del = (t, k, at) => ({ t, k, at, op: 'del' });

// newId()-style ids, like the phone makes.
const BASE = 1761000000000000;
const EX = BASE + 1;
const ROUTINE = BASE + 2;
const RE1 = BASE + 3;
const RE2 = BASE + 4;
const WORKOUT = BASE + 5;
const SET1 = BASE + 6;
const SET2 = BASE + 7;
const HABIT = BASE + 8;
const T0 = 1761100000000;

after(() => {
  resetDb();
  rmSync(dir, { recursive: true, force: true });
});

let seqAfterSeed = 0;

test('auth: a bad or missing token is refused', async () => {
  assert.equal((await call(health.GET, 'GET', '/api/health', undefined, 'nope')).status, 401);
  assert.equal((await call(health.GET, 'GET', '/api/health', undefined, null)).status, 401);
  assert.equal((await call(pushRoute.POST, 'POST', '/api/sync/push', { changes: [] }, 'nope')).status, 401);
  const saved = process.env.VOLT_TOKEN;
  delete process.env.VOLT_TOKEN;
  assert.equal((await call(health.GET, 'GET', '/api/health')).status, 500);
  process.env.VOLT_TOKEN = saved;
  const ok = await call(health.GET, 'GET', '/api/health');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.seq, 0);
});

test('push puts, then pull them back', async () => {
  const changes = [
    // Children before parents on purpose: the hub orders them itself.
    put(
      'sets',
      { id: SET1, workout_id: WORKOUT, exercise_id: EX, set_index: 1, kg: 22.5, reps: 8, done_at: T0 + 60000 },
      key(SET1),
      T0,
    ),
    put(
      'sets',
      { id: SET2, workout_id: WORKOUT, exercise_id: EX, set_index: 2, kg: 22.5, reps: 7, done_at: T0 + 200000 },
      key(SET2),
      T0,
    ),
    put('exercises', { id: EX, name: 'Incline dumbbell press', tip: 'Pinned', junk: 'dropped' }, key(EX), T0),
    put('routines', { id: ROUTINE, name: 'Upper A', focus: 'Chest', weekday: 1, position: 0 }, key(ROUTINE), T0),
    put(
      'routine_exercises',
      {
        id: RE1,
        routine_id: ROUTINE,
        exercise_id: EX,
        position: 0,
        sets: 4,
        rep_min: 6,
        rep_max: 10,
        rest_sec: 150,
        superset: null,
      },
      key(RE1),
      T0,
    ),
    put(
      'routine_exercises',
      {
        id: RE2,
        routine_id: ROUTINE,
        exercise_id: EX,
        position: 1,
        sets: 3,
        rep_min: 8,
        rep_max: 12,
        rest_sec: 120,
        superset: null,
      },
      key(RE2),
      T0,
    ),
    put(
      'workouts',
      { id: WORKOUT, routine_id: ROUTINE, name: 'Upper A', started_at: T0, finished_at: T0 + 3600000 },
      key(WORKOUT),
      T0,
    ),
    put(
      'habits',
      { id: HABIT, kind: 'supplement', title: 'Creatine', dose: '5 g', position: 0, archived: 0 },
      key(HABIT),
      T0,
    ),
    put('habit_logs', { habit_id: HABIT, day: '2026-10-22', done_at: T0 }, key(HABIT, '2026-10-22'), T0),
    put('bodyweight', { day: '2026-10-22', kg: 68.4 }, key('2026-10-22'), T0),
    put('settings', { key: 'kcal_target', value: '3100' }, key('kcal_target'), T0),
    put('settings', { key: 'notifications_asked', value: '1' }, key('notifications_asked'), T0),
    put('settings', { key: 'hub_last_sync', value: '1' }, key('hub_last_sync'), T0),
    put('nope', { id: 1 }, key(1), T0),
  ];
  const r = await push(changes);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.applied, 11);
  assert.equal(r.body.skipped, 3);
  assert.equal(r.body.seq, 11);

  const p = await pull(0);
  assert.equal(p.status, 200);
  assert.equal(p.body.more, false);
  assert.equal(p.body.seq, 11);
  assert.equal(p.body.changes.length, 11);
  const byKey = new Map(p.body.changes.map((c) => [`${c.t} ${c.k}`, c]));
  assert.deepEqual(byKey.get(`exercises ${key(EX)}`), {
    t: 'exercises',
    k: key(EX),
    at: T0,
    op: 'put',
    row: { id: EX, name: 'Incline dumbbell press', tip: 'Pinned' },
  });
  assert.deepEqual(byKey.get(`habit_logs ${key(HABIT, '2026-10-22')}`).row, {
    habit_id: HABIT,
    day: '2026-10-22',
    done_at: T0,
  });
  assert.equal(byKey.get(`bodyweight ${key('2026-10-22')}`).row.kg, 68.4);
  assert.equal(byKey.get(`sets ${key(SET1)}`).row.kg, 22.5);
  assert.ok(!p.body.changes.some((c) => c.t === 'settings' && c.k !== key('kcal_target')), 'local settings never sync');
  assert.equal((await sql('SELECT COUNT(*) AS n FROM settings')).at(0).n, 1);
  // Parents were applied before children: _meta seq order follows table order.
  const order = p.body.changes.map((c) => c.t);
  assert.ok(order.indexOf('workouts') < order.indexOf('sets'));
  assert.ok(order.indexOf('routines') < order.indexOf('routine_exercises'));

  // Paging.
  const page = await pull(0, 4);
  assert.equal(page.body.changes.length, 4);
  assert.equal(page.body.more, true);
  const rest = await pull(page.body.seq, 500);
  assert.equal(rest.body.changes.length, 7);
  assert.equal(rest.body.more, false);
  seqAfterSeed = rest.body.seq;

  // Pushes don't echo: nothing new for the phone beyond what it sent.
  assert.equal((await pull(seqAfterSeed)).body.changes.length, 0);
});

test('last write wins by at', async () => {
  const older = await push([put('bodyweight', { day: '2026-10-22', kg: 99 }, key('2026-10-22'), T0 - 1)]);
  assert.deepEqual([older.body.applied, older.body.skipped], [0, 1]);
  assert.equal((await sql("SELECT kg FROM bodyweight WHERE day = '2026-10-22'"))[0].kg, 68.4);

  const tie = await push([put('bodyweight', { day: '2026-10-22', kg: 68.5 }, key('2026-10-22'), T0)]);
  assert.deepEqual([tie.body.applied, tie.body.skipped], [1, 0], 'ties go to the incoming change');

  const newer = await push([put('bodyweight', { day: '2026-10-22', kg: 68.9 }, key('2026-10-22'), T0 + 5)]);
  assert.deepEqual([newer.body.applied, newer.body.skipped], [1, 0]);
  assert.equal((await sql("SELECT kg FROM bodyweight WHERE day = '2026-10-22'"))[0].kg, 68.9);

  const p = await pull(seqAfterSeed);
  const last = p.body.changes.at(-1);
  assert.equal(last.t, 'bodyweight');
  assert.equal(last.at, T0 + 5);
  assert.equal(last.row.kg, 68.9);

  // An older delete loses too.
  const staleDel = await push([del('bodyweight', key('2026-10-22'), T0)]);
  assert.deepEqual([staleDel.body.applied, staleDel.body.skipped], [0, 1]);
  seqAfterSeed = p.body.seq;
});

test('push validation: too many changes, bad body', async () => {
  const many = Array.from({ length: 501 }, (_, i) =>
    put('bodyweight', { day: `2020-01-${i}`, kg: 1 }, key(`2020-01-${i}`), 1),
  );
  assert.equal((await push(many)).status, 413);
  assert.equal((await call(pushRoute.POST, 'POST', '/api/sync/push', { nope: 1 })).status, 400);
});

test('/api/exec: insert without id gets max + 1 and shows up in pull', async () => {
  const before = Date.now();
  const r = await run({
    sql: "INSERT INTO food_entries (day, meal, name, kcal, protein, carbs, fat, created_at) VALUES ('2026-10-22', 'lunch', 'Uni lunch', 800, 35, 95, 28, ?)",
    args: [before],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // No food rows yet, so the first gets 1; the next one max + 1 across everything in the table.
  assert.equal(r.body.results[0].rowsAffected, 1);
  const first = r.body.results[0].lastInsertRowid;
  await run(
    `INSERT INTO food_entries (id, day, meal, name, kcal, created_at) VALUES (${BASE + 100}, '2026-10-22', 'snacks', 'Banana', 105, 1)`,
  );
  const r2 = await run(
    "INSERT INTO food_entries (day, meal, name, kcal, created_at) VALUES ('2026-10-22', 'dinner', 'Dorm dinner', 750, 1)",
  );
  assert.equal(r2.body.results[0].lastInsertRowid, BASE + 101);
  assert.ok(first >= 1);

  const p = await pull(seqAfterSeed);
  const food = p.body.changes.filter((c) => c.t === 'food_entries');
  assert.equal(food.length, 3);
  assert.ok(food.every((c) => c.op === 'put' && c.at >= before - 5 && c.at <= Date.now() + 5));
  assert.deepEqual(food.at(-1).row.id, BASE + 101);
  assert.equal(food.at(-1).k, key(BASE + 101));
  seqAfterSeed = p.body.seq;
});

test('/api/exec: UPDATE shows up in pull with a fresh at', async () => {
  const before = Date.now();
  const r = await run({ sql: 'UPDATE sets SET kg = ? WHERE id = ?', args: [25, SET2] });
  assert.equal(r.body.results[0].rowsAffected, 1);
  const p = await pull(seqAfterSeed);
  assert.equal(p.body.changes.length, 1);
  const c = p.body.changes[0];
  assert.equal(c.t, 'sets');
  assert.equal(c.k, key(SET2));
  assert.equal(c.row.kg, 25);
  assert.ok(c.at >= before - 5 && c.at > T0, `at ${c.at} should be now`);

  // Local settings written through exec stay local.
  await run("INSERT INTO settings (key, value) VALUES ('local_theme', 'dark')");
  await run("INSERT INTO settings (key, value) VALUES ('protein_target', '150')");
  const s = await pull(p.body.seq);
  assert.deepEqual(
    s.body.changes.map((c) => c.k),
    [key('protein_target')],
  );
  seqAfterSeed = s.body.seq;
});

test('/api/exec refuses schema changes, the sync tables and multiple statements; rolls back on error', async () => {
  assert.equal((await run('DROP TABLE sets')).status, 400);
  assert.equal((await run('UPDATE _flag SET applying = 1')).status, 400);
  assert.equal((await run('DELETE FROM sets; DELETE FROM workouts')).status, 400);
  const bad = await run("UPDATE habits SET title = 'X'", 'INSERT INTO nope VALUES (1)');
  assert.equal(bad.status, 400);
  assert.equal((await sql('SELECT title FROM habits'))[0].title, 'Creatine', 'the whole batch rolled back');
  // Exercises still in use can't be deleted, like the app's foreign keys.
  assert.equal((await run(`DELETE FROM exercises WHERE id = ${EX}`)).status, 400);
  assert.equal((await pull(seqAfterSeed)).body.changes.length, 0);
});

test('delete through exec cascades, and the children deletes show up in pull', async () => {
  const r = await run(`DELETE FROM routines WHERE id = ${ROUTINE}`, `DELETE FROM workouts WHERE id = ${WORKOUT}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await sql('SELECT COUNT(*) AS n FROM routine_exercises'))[0].n, 0);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM sets'))[0].n, 0);
  const p = await pull(seqAfterSeed);
  const dels = new Set(p.body.changes.filter((c) => c.op === 'del').map((c) => `${c.t} ${c.k}`));
  for (const k of [
    `routines ${key(ROUTINE)}`,
    `routine_exercises ${key(RE1)}`,
    `routine_exercises ${key(RE2)}`,
    `workouts ${key(WORKOUT)}`,
    `sets ${key(SET1)}`,
    `sets ${key(SET2)}`,
  ]) {
    assert.ok(dels.has(k), `missing del ${k}`);
  }
  seqAfterSeed = p.body.seq;
});

test('delete through push removes children, records only the parent', async () => {
  const del1 = await push([del('habits', key(HABIT), Date.now())]);
  assert.deepEqual([del1.body.applied, del1.body.skipped], [1, 0]);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM habit_logs'))[0].n, 0);
  const p = await pull(seqAfterSeed);
  assert.deepEqual(
    p.body.changes.map((c) => [c.t, c.op]),
    [['habits', 'del']],
  );
  // A delete for a row the hub never had is still recorded, so a later stale put loses.
  const ghost = await push([del('food_presets', key(42), T0 + 10)]);
  assert.equal(ghost.body.applied, 1);
  const stale = await push([put('food_presets', { id: 42, name: 'Old', kcal: 1 }, key(42), T0)]);
  assert.equal(stale.body.skipped, 1);
});

test('query is read-only and one statement at a time', async () => {
  const w = await call(query.POST, 'POST', '/api/query', {
    sql: "INSERT INTO settings (key, value) VALUES ('x', 'y')",
  });
  assert.equal(w.status, 400);
  const multi = await call(query.POST, 'POST', '/api/query', { sql: 'SELECT 1; DELETE FROM settings' });
  assert.equal(multi.status, 400);
  const ok = await call(query.POST, 'POST', '/api/query', {
    sql: "SELECT replace(';', 'x', 'y') AS semi, ? AS a -- trailing; comment\n;",
    args: [7],
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body, { columns: ['semi', 'a'], rows: [[';', 7]] });
  assert.equal((await sql("SELECT COUNT(*) AS n FROM settings WHERE key = 'x'"))[0].n, 0);
});

test('schema and health', async () => {
  const s = await call(schema.GET, 'GET', '/api/schema');
  assert.equal(s.status, 200);
  const sets = s.body.tables.find((t) => t.name === 'sets');
  assert.deepEqual(
    sets.columns.map((c) => c.name),
    ['id', 'workout_id', 'exercise_id', 'set_index', 'kg', 'reps', 'done_at'],
  );
  assert.ok(!s.body.tables.some((t) => t.name.startsWith('_')));
  const h = await call(health.GET, 'GET', '/api/health');
  assert.equal(h.body.rows.exercises, 1);
  assert.equal(h.body.rows.sets, 0);
  assert.equal(h.body.seq, (await pull(0)).body.seq);
});
