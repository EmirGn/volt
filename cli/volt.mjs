#!/usr/bin/env node
// volt: Emir's training data on the Volt hub, from the terminal. Node 22+, no dependencies.
// Config: VOLT_HUB_URL / VOLT_HUB_TOKEN from the environment, or KEY=VALUE lines in ~/.volt/hub.env.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HELP = `volt: Emir's Volt data (the hub copy of the phone app)

  volt status                       hub health, row counts
  volt schema                       tables and columns
  volt sql "<select>" [--json]      read anything
  volt exec "<sql>" ["<sql>" …]     write, in one transaction
  volt today [--json]               planned routine, food vs targets, habits, last workout
  volt week [--json]                this week's workouts, volume, kcal average, bodyweight
  volt exercise "<name>" [--json]   every session, best set, e1RM trend
  volt log food "<name>" --kcal N [--protein N --carbs N --fat N --meal lunch --day YYYY-MM-DD]
  volt log weight <kg> [--day YYYY-MM-DD]
  volt id                           a fresh row id
  volt connect [--url <hub>]        QR code that connects the phone app to the hub (scan it with the phone)

Config: VOLT_HUB_URL and VOLT_HUB_TOKEN, from the environment or ~/.volt/hub.env`;

const DEFAULT_TARGETS = { kcal: 3100, protein: 140, carbs: 430, fat: 90 };
const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

class CliError extends Error {}

// ---------- config + hub ----------

function config() {
  const env = { ...readEnvFile(join(homedir(), '.volt', 'hub.env')) };
  const url = process.env.VOLT_HUB_URL || env.VOLT_HUB_URL;
  const token = process.env.VOLT_HUB_TOKEN || env.VOLT_HUB_TOKEN;
  if (!url || !token) {
    throw new CliError('No hub configured. Set VOLT_HUB_URL and VOLT_HUB_TOKEN, or put them in ~/.volt/hub.env');
  }
  return { url: url.replace(/\/+$/, ''), token };
}

function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

let hub;
async function api(method, path, body) {
  hub ??= config();
  let res;
  try {
    res = await fetch(hub.url + path, {
      method,
      headers: { authorization: `Bearer ${hub.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    const why = e?.cause?.code || e?.cause?.message || e?.message || String(e);
    throw new CliError(`Can't reach the hub at ${hub.url} (${why})`);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new CliError(`The hub answered ${res.status} without JSON. Is ${hub.url} the Volt hub?`);
  }
  if (res.status === 401) throw new CliError('Unauthorized: VOLT_HUB_TOKEN does not match the hub token');
  if (!res.ok) throw new CliError(`Hub error ${res.status}: ${data?.error ?? 'unknown'}`);
  return data;
}

/** Rows as objects. */
async function q(sql, args = []) {
  const r = await api('POST', '/api/query', { sql, args });
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
}

const execute = (statements) => api('POST', '/api/exec', { statements });

async function settings() {
  const rows = await q('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function targetsFrom(s) {
  const n = (k, d) => (s[k] != null && s[k] !== '' && Number.isFinite(Number(s[k])) ? Number(s[k]) : d);
  return {
    kcal: n('kcal_target', DEFAULT_TARGETS.kcal),
    protein: n('protein_target', DEFAULT_TARGETS.protein),
    carbs: n('carbs_target', DEFAULT_TARGETS.carbs),
    fat: n('fat_target', DEFAULT_TARGETS.fat),
    kgStep: n('kg_step', 2.5),
  };
}

// ---------- ids, dates, numbers ----------

let lastId = 0;
/** Same scheme as the app: time-ordered, ~1.8e15, below 2^53. */
function newId() {
  lastId = Math.max(lastId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000));
  return lastId;
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;
function startOfWeek(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - (isoWeekday(d) - 1));
  return s;
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${WEEKDAYS[isoWeekday(d) - 1]} ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
};
const fmtDay = (key) => fmtDate(new Date(`${key}T12:00:00`).getTime());
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmtNum = (n, digits = 1) => (n == null ? '–' : String(Number(Number(n).toFixed(digits))));
const fmtKg = (n) => fmtNum(n, 2);
const fmtDuration = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
};
const e1rm = (s) => s.kg * (1 + s.reps / 30);
const heavier = (a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a);
const setsText = (sets) => sets.map((s) => `${fmtKg(s.kg)}×${s.reps}`).join('  ');

function defaultMeal(d = new Date()) {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snacks';
}

function checkDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T12:00:00`).getTime())) {
    throw new CliError(`Day must look like 2026-10-22, got "${day}"`);
  }
  return day;
}

function num(v, name, { required = false, min = 0 } = {}) {
  if (v === undefined || v === true) {
    if (required) throw new CliError(`--${name} is required`);
    return undefined;
  }
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min) throw new CliError(`--${name} must be a number${min === 0 ? ' ≥ 0' : ''}`);
  return n;
}

// ---------- output ----------

/** Aligned columns; numbers right-aligned. */
function printTable(columns, rows, { indent = '' } = {}) {
  if (!rows.length) return;
  const cells = rows.map((r) => r.map((v) => (v == null ? '' : String(v))));
  const widths = columns.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)));
  const right = columns.map((_c, i) => rows.every((r) => r[i] == null || typeof r[i] === 'number'));
  const line = (r) =>
    indent +
    r
      .map((v, i) => (right[i] ? v.padStart(widths[i]) : v.padEnd(widths[i])))
      .join('  ')
      .trimEnd();
  if (columns.some((c) => c)) console.log(line(columns));
  for (const r of cells) console.log(line(r));
}

const bar = (value, target, width = 16) => {
  const filled = target > 0 ? Math.min(width, Math.round((value / target) * width)) : 0;
  return '█'.repeat(filled) + '·'.repeat(width - filled);
};

// ---------- args ----------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && !['json', 'help'].includes(a.slice(2))) {
        flags[a.slice(2)] = argv[++i];
      } else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

// ---------- commands ----------

async function status({ flags }) {
  const h = await api('GET', '/api/health');
  if (flags.json) return console.log(JSON.stringify(h, null, 2));
  console.log(`Hub ${hub.url}  ok  seq ${h.seq}`);
  printTable(
    ['table', 'rows'],
    Object.entries(h.rows).map(([t, n]) => [t, n]),
    { indent: '  ' },
  );
}

async function schema({ flags }) {
  const s = await api('GET', '/api/schema');
  if (flags.json) return console.log(JSON.stringify(s, null, 2));
  for (const t of s.tables) {
    const cols = t.columns.map((c) => `${c.name} ${c.type.toLowerCase()}${c.pk ? ' pk' : c.notnull ? '' : '?'}`);
    console.log(`${t.name}: ${cols.join(', ')}`);
  }
  console.log('\n(? = nullable)');
}

async function sql({ positional, flags }) {
  const text = positional.join(' ').trim();
  if (!text) throw new CliError('Usage: volt sql "<select>" [--json]');
  const r = await api('POST', '/api/query', { sql: text, args: [] });
  if (flags.json) {
    const rows = r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
    return console.log(JSON.stringify(rows, null, 2));
  }
  if (!r.rows.length) return console.log(`(no rows) ${r.columns.join(', ')}`);
  printTable(r.columns, r.rows);
  console.log(`(${r.rows.length} row${r.rows.length === 1 ? '' : 's'})`);
}

async function exec({ positional, flags }) {
  if (!positional.length) throw new CliError('Usage: volt exec "<sql>" ["<sql>" …]');
  const r = await execute(positional.map((s) => ({ sql: s })));
  if (flags.json) return console.log(JSON.stringify(r, null, 2));
  r.results.forEach((res, i) => {
    const id = res.lastInsertRowid != null && /^\s*insert/i.test(positional[i]) ? `, id ${res.lastInsertRowid}` : '';
    console.log(`${i + 1}. ${res.rowsAffected} row${res.rowsAffected === 1 ? '' : 's'}${id}`);
  });
  console.log('Committed. The phone picks it up on its next sync.');
}

/** Each exercise's sets from its most recent finished workout. */
async function lastPerformance(exerciseIds) {
  if (!exerciseIds.length) return new Map();
  const rows = await q(
    `SELECT s.exercise_id, s.workout_id, w.started_at, s.kg, s.reps
     FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE w.finished_at IS NOT NULL AND s.exercise_id IN (SELECT value FROM json_each(?))
     ORDER BY w.started_at DESC, s.set_index, s.done_at`,
    [JSON.stringify(exerciseIds)],
  );
  const out = new Map();
  for (const r of rows) {
    let e = out.get(r.exercise_id);
    if (!e) out.set(r.exercise_id, (e = { workoutId: r.workout_id, startedAt: r.started_at, sets: [] }));
    if (e.workoutId === r.workout_id) e.sets.push({ kg: r.kg, reps: r.reps });
  }
  return out;
}

async function today({ flags }) {
  const now = new Date();
  const day = dayKey(now);
  const wd = isoWeekday(now);
  const [s, routines, food, habits, lastWorkout, todays, weight] = await Promise.all([
    settings(),
    q('SELECT id, name, focus FROM routines WHERE weekday = ? ORDER BY position LIMIT 1', [wd]),
    q(
      `SELECT COALESCE(SUM(kcal),0) AS kcal, COALESCE(SUM(protein),0) AS protein, COALESCE(SUM(carbs),0) AS carbs,
              COALESCE(SUM(fat),0) AS fat, COUNT(*) AS entries FROM food_entries WHERE day = ?`,
      [day],
    ),
    q(
      `SELECT h.id, h.kind, h.title, h.dose, l.done_at FROM habits h
       LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.day = ?
       WHERE h.archived = 0 ORDER BY h.kind DESC, h.position`,
      [day],
    ),
    q(
      `SELECT w.id, w.name, w.started_at, w.finished_at, COUNT(s.id) AS sets, COALESCE(SUM(s.kg * s.reps), 0) AS volume
       FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
       WHERE w.finished_at IS NOT NULL GROUP BY w.id ORDER BY w.started_at DESC LIMIT 1`,
    ),
    q('SELECT id, name, started_at, finished_at FROM workouts WHERE started_at >= ? ORDER BY started_at', [
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    ]),
    q('SELECT day, kg FROM bodyweight ORDER BY day DESC LIMIT 1'),
  ]);
  const targets = targetsFrom(s);
  const routine = routines[0] ?? null;
  let plan = [];
  if (routine) {
    plan = await q(
      `SELECT re.exercise_id, e.name, re.sets, re.rep_min, re.rep_max, re.rest_sec, re.superset
       FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
       WHERE re.routine_id = ? ORDER BY re.position`,
      [routine.id],
    );
    const last = await lastPerformance([...new Set(plan.map((p) => p.exercise_id))]);
    for (const p of plan) {
      const l = last.get(p.exercise_id);
      p.last = l ? { date: dayKey(new Date(l.startedAt)), sets: l.sets } : null;
      // Double progression: every planned set at the top of the range → add kg_step next time.
      const top = l?.sets.length >= p.sets && l.sets.slice(0, p.sets).every((x) => x.reps >= p.rep_max);
      p.next = l ? (top ? { kg: Math.max(...l.sets.map((x) => x.kg)) + targets.kgStep, why: 'add weight' } : null) : null;
    }
  }
  const totals = food[0];
  const out = {
    day,
    weekday: WEEKDAYS[wd - 1],
    routine: routine && { ...routine, exercises: plan },
    workoutsToday: todays,
    food: { totals, targets: { kcal: targets.kcal, protein: targets.protein, carbs: targets.carbs, fat: targets.fat } },
    habits: habits.map((h) => ({ ...h, done: h.done_at != null })),
    lastWorkout: lastWorkout[0] ?? null,
    bodyweight: weight[0] ?? null,
  };
  if (flags.json) return console.log(JSON.stringify(out, null, 2));

  console.log(`${out.weekday} ${day}`);
  console.log('');
  if (!routine) console.log('Rest day: no routine planned.');
  else {
    console.log(`${routine.name}${routine.focus ? ` · ${routine.focus}` : ''}`);
    printTable(
      ['', 'target', 'last', ''],
      plan.map((p) => [
        `${p.superset != null ? '⤷ ' : ''}${p.name}`,
        `${p.sets}×${p.rep_min}–${p.rep_max}`,
        p.last ? setsText(p.last.sets) : 'new',
        p.next ? `→ ${fmtKg(p.next.kg)} kg` : '',
      ]),
      { indent: '  ' },
    );
  }
  for (const w of todays) {
    console.log(
      w.finished_at
        ? `  Done: ${w.name}, ${fmtTime(w.started_at)}–${fmtTime(w.finished_at)}`
        : `  In progress: ${w.name} since ${fmtTime(w.started_at)}`,
    );
  }
  console.log('');
  console.log(`Food (${totals.entries} entr${totals.entries === 1 ? 'y' : 'ies'})`);
  printTable(
    ['', '', '', ''],
    [
      ['kcal', Math.round(totals.kcal), `/ ${targets.kcal}`, bar(totals.kcal, targets.kcal)],
      ['protein', fmtNum(totals.protein, 0) + ' g', `/ ${targets.protein} g`, bar(totals.protein, targets.protein)],
      ['carbs', fmtNum(totals.carbs, 0) + ' g', `/ ${targets.carbs} g`, bar(totals.carbs, targets.carbs)],
      ['fat', fmtNum(totals.fat, 0) + ' g', `/ ${targets.fat} g`, bar(totals.fat, targets.fat)],
    ],
    { indent: '  ' },
  );
  console.log('');
  for (const kind of ['supplement', 'task']) {
    const list = out.habits.filter((h) => h.kind === kind);
    if (!list.length) continue;
    const done = list.filter((h) => h.done).length;
    console.log(`${kind === 'supplement' ? 'Supplements' : 'Tasks'} ${done}/${list.length}`);
    for (const h of list) console.log(`  ${h.done ? '✓' : '·'} ${h.title}${h.dose ? ` (${h.dose})` : ''}`);
  }
  console.log('');
  const lw = out.lastWorkout;
  if (lw) {
    console.log(
      `Last workout: ${lw.name}, ${fmtDate(lw.started_at)}, ${fmtDuration(lw.finished_at - lw.started_at)}, ` +
        `${lw.sets} sets, ${Math.round(lw.volume)} kg volume`,
    );
  } else console.log('Last workout: none yet');
  if (out.bodyweight) console.log(`Bodyweight: ${fmtKg(out.bodyweight.kg)} kg (${fmtDay(out.bodyweight.day)})`);
}

async function week({ flags }) {
  const now = new Date();
  const start = startOfWeek(now);
  const end = addDays(start, 7);
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)));
  const [s, routines, workouts, food, weights, before] = await Promise.all([
    settings(),
    q('SELECT id, name, weekday FROM routines WHERE weekday IS NOT NULL'),
    q(
      `SELECT w.id, w.name, w.started_at, w.finished_at, COUNT(s.id) AS sets, COALESCE(SUM(s.kg * s.reps), 0) AS volume
       FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
       WHERE w.started_at >= ? AND w.started_at < ? GROUP BY w.id ORDER BY w.started_at`,
      [start.getTime(), end.getTime()],
    ),
    q(
      `SELECT day, SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat
       FROM food_entries WHERE day >= ? AND day <= ? GROUP BY day`,
      [days[0], days[6]],
    ),
    q('SELECT day, kg FROM bodyweight WHERE day >= ? AND day <= ? ORDER BY day', [days[0], days[6]]),
    q('SELECT day, kg FROM bodyweight WHERE day < ? ORDER BY day DESC LIMIT 1', [days[0]]),
  ]);
  const targets = targetsFrom(s);
  const foodBy = new Map(food.map((f) => [f.day, f]));
  const weightBy = new Map(weights.map((w) => [w.day, w.kg]));
  const todayKey = dayKey(now);
  const rows = days.map((d, i) => ({
    day: d,
    weekday: WEEKDAYS[i],
    planned: routines.find((r) => r.weekday === i + 1)?.name ?? null,
    workouts: workouts.filter((w) => dayKey(new Date(w.started_at)) === d),
    food: foodBy.get(d) ?? null,
    kg: weightBy.get(d) ?? null,
  }));
  const loggedDays = food.filter((f) => f.day <= todayKey);
  const avg = (k) => (loggedDays.length ? loggedDays.reduce((a, f) => a + f[k], 0) / loggedDays.length : null);
  const finished = workouts.filter((w) => w.finished_at);
  const summary = {
    week: `${days[0]} – ${days[6]}`,
    workouts: finished.length,
    planned: routines.length,
    sets: finished.reduce((a, w) => a + w.sets, 0),
    volume: Math.round(finished.reduce((a, w) => a + w.volume, 0)),
    kcalAvg: avg('kcal') == null ? null : Math.round(avg('kcal')),
    proteinAvg: avg('protein') == null ? null : Math.round(avg('protein')),
    foodDays: loggedDays.length,
    bodyweight: { start: before[0]?.kg ?? weights[0]?.kg ?? null, latest: weights.at(-1)?.kg ?? before[0]?.kg ?? null },
    targets: { kcal: targets.kcal, protein: targets.protein },
  };
  if (flags.json) return console.log(JSON.stringify({ summary, days: rows }, null, 2));

  console.log(`Week ${fmtDay(days[0])} – ${fmtDay(days[6])}`);
  console.log('');
  printTable(
    ['', 'planned', 'done', 'sets', 'volume', 'kcal', 'protein', 'kg'],
    rows.map((r) => {
      const w = r.workouts;
      const done = w.length ? w.map((x) => x.name + (x.finished_at ? '' : ' (open)')).join(', ') : r.day < todayKey && r.planned ? 'missed' : '';
      return [
        `${r.weekday}${r.day === todayKey ? '*' : ''}`,
        r.planned ?? '',
        done,
        w.length ? w.reduce((a, x) => a + x.sets, 0) : null,
        w.length ? Math.round(w.reduce((a, x) => a + x.volume, 0)) : null,
        r.food ? Math.round(r.food.kcal) : null,
        r.food ? Math.round(r.food.protein) : null,
        r.kg,
      ];
    }),
    { indent: '  ' },
  );
  console.log('');
  console.log(`Workouts ${summary.workouts}/${summary.planned} · ${summary.sets} sets · ${summary.volume} kg volume`);
  if (summary.kcalAvg != null) {
    console.log(
      `Food avg over ${summary.foodDays} day${summary.foodDays === 1 ? '' : 's'}: ${summary.kcalAvg} kcal (target ${targets.kcal}), ${summary.proteinAvg} g protein (target ${targets.protein})`,
    );
  } else console.log('Food: nothing logged this week');
  const bw = summary.bodyweight;
  if (bw.latest != null) {
    const delta = bw.start != null ? bw.latest - bw.start : 0;
    console.log(`Bodyweight ${fmtKg(bw.latest)} kg${delta ? ` (${delta > 0 ? '+' : ''}${fmtKg(delta)} this week)` : ''}`);
  }
}

async function exercise({ positional, flags }) {
  const name = positional.join(' ').trim().toLowerCase();
  if (!name) throw new CliError('Usage: volt exercise "<name>"');
  const all = await q('SELECT id, name FROM exercises ORDER BY name');
  const exact = all.filter((e) => e.name.toLowerCase() === name);
  const matches = exact.length ? exact : all.filter((e) => e.name.toLowerCase().includes(name));
  if (!matches.length) throw new CliError(`No exercise matches "${name}". Known: ${all.map((e) => e.name).join(', ')}`);
  if (matches.length > 1) {
    throw new CliError(`"${name}" matches ${matches.length} exercises: ${matches.map((e) => e.name).join(', ')}. Be more specific.`);
  }
  const ex = matches[0];
  const rows = await q(
    `SELECT w.id AS workout_id, w.name AS workout, w.started_at, s.kg, s.reps
     FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.finished_at IS NOT NULL
     ORDER BY w.started_at, s.set_index, s.done_at`,
    [ex.id],
  );
  const sessions = [];
  for (const r of rows) {
    let sn = sessions.at(-1);
    if (!sn || sn.workoutId !== r.workout_id) {
      sessions.push((sn = { workoutId: r.workout_id, workout: r.workout, date: dayKey(new Date(r.started_at)), startedAt: r.started_at, sets: [] }));
    }
    sn.sets.push({ kg: r.kg, reps: r.reps });
  }
  let top = -Infinity;
  for (const sn of sessions) {
    sn.best = sn.sets.reduce(heavier);
    sn.e1rm = Math.round(Math.max(...sn.sets.map(e1rm)) * 10) / 10;
    sn.volume = Math.round(sn.sets.reduce((a, x) => a + x.kg * x.reps, 0));
    sn.pr = top > -Infinity && sn.best.kg > top;
    top = Math.max(top, sn.best.kg);
  }
  if (flags.json) return console.log(JSON.stringify({ exercise: ex, sessions }, null, 2));
  console.log(`${ex.name}: ${sessions.length} session${sessions.length === 1 ? '' : 's'}`);
  if (!sessions.length) return;
  printTable(
    ['date', 'sets', 'best', 'e1RM', ''],
    sessions.map((sn) => [fmtDate(sn.startedAt), setsText(sn.sets), `${fmtKg(sn.best.kg)}×${sn.best.reps}`, sn.e1rm, sn.pr ? 'PR' : '']),
    { indent: '  ' },
  );
  if (sessions.length > 1) {
    const first = sessions[0].e1rm;
    const last = sessions.at(-1).e1rm;
    const d = last - first;
    console.log(`e1RM ${fmtNum(first)} → ${fmtNum(last)} kg (${d >= 0 ? '+' : ''}${fmtNum(d)})`);
  }
}

async function log({ positional, flags }) {
  const [what, ...rest] = positional;
  if (what === 'food') {
    const name = rest.join(' ').trim();
    if (!name) throw new CliError('Usage: volt log food "<name>" --kcal N [--protein N --carbs N --fat N --meal lunch --day YYYY-MM-DD]');
    const kcal = Math.round(num(flags.kcal, 'kcal', { required: true }));
    const protein = num(flags.protein, 'protein') ?? 0;
    const carbs = num(flags.carbs, 'carbs') ?? 0;
    const fat = num(flags.fat, 'fat') ?? 0;
    const meal = flags.meal === undefined ? defaultMeal() : String(flags.meal).toLowerCase();
    if (!MEALS.includes(meal)) throw new CliError(`--meal must be one of ${MEALS.join(', ')}`);
    const day = flags.day === undefined ? dayKey() : checkDay(String(flags.day));
    const id = newId();
    await execute([
      {
        sql: `INSERT INTO food_entries (id, day, meal, name, kcal, protein, carbs, fat, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, day, meal, name, kcal, protein, carbs, fat, Date.now()],
      },
    ]);
    const [t] = await q(
      'SELECT SUM(kcal) AS kcal, SUM(protein) AS protein FROM food_entries WHERE day = ?',
      [day],
    );
    const targets = targetsFrom(await settings());
    if (flags.json) return console.log(JSON.stringify({ id, day, meal, name, kcal, protein, carbs, fat, dayTotals: t }));
    console.log(`Logged ${name}: ${kcal} kcal, P ${fmtNum(protein)} C ${fmtNum(carbs)} F ${fmtNum(fat)} → ${meal}, ${fmtDay(day)} (id ${id})`);
    console.log(`${fmtDay(day)}: ${Math.round(t.kcal)} / ${targets.kcal} kcal, ${Math.round(t.protein)} / ${targets.protein} g protein`);
    return;
  }
  if (what === 'weight') {
    if (!rest.length) throw new CliError('Usage: volt log weight <kg> [--day YYYY-MM-DD]');
    const kg = Number(String(rest[0]).replace(',', '.'));
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) throw new CliError(`"${rest[0]}" doesn't look like a bodyweight in kg`);
    const day = flags.day === undefined ? dayKey() : checkDay(String(flags.day));
    const [prev] = await q('SELECT day, kg FROM bodyweight WHERE day < ? ORDER BY day DESC LIMIT 1', [day]);
    await execute([
      { sql: 'INSERT INTO bodyweight (day, kg) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET kg = excluded.kg', args: [day, kg] },
    ]);
    if (flags.json) return console.log(JSON.stringify({ day, kg, previous: prev ?? null }));
    const delta = prev ? ` (${kg - prev.kg >= 0 ? '+' : ''}${fmtKg(kg - prev.kg)} since ${fmtDay(prev.day)})` : '';
    console.log(`Bodyweight ${fmtKg(kg)} kg on ${fmtDay(day)}${delta}`);
    return;
  }
  throw new CliError('Usage: volt log food "<name>" --kcal N …  |  volt log weight <kg>');
}

/**
 * Shows the volt://hub link as a QR code. The phone's camera opens it in Volt, which saves the hub on the phone only.
 * The token never goes into a build: the repo and its APKs are public.
 */
async function connect(flags) {
  const { url, token } = config();
  const hubUrl = (flags.url || url).replace(/\/+$/, '');
  const link = `volt://hub?url=${encodeURIComponent(hubUrl)}&token=${encodeURIComponent(token)}`;
  const qr = spawnSync('qrencode', ['-t', 'ANSIUTF8', '-m', '2', link], { encoding: 'utf8' });
  if (qr.status !== 0) throw new CliError('Needs qrencode for the QR code: brew install qrencode');
  console.log(qr.stdout);
  console.log(`Scan this with the phone's camera and open it in Volt.\nHub: ${hubUrl}\nThe code holds your hub token, so don't share a screenshot of it.`);
}

const COMMANDS = {
  status,
  schema,
  sql,
  exec,
  today,
  week,
  exercise,
  log,
  id: () => console.log(newId()),
  connect,
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return console.log(HELP);
  const fn = COMMANDS[cmd];
  if (!fn) throw new CliError(`Unknown command "${cmd}".\n\n${HELP}`);
  await fn(parseArgs(rest));
}

main().catch((e) => {
  if (e instanceof CliError) console.error(`volt: ${e.message}`);
  else console.error(e);
  process.exit(1);
});
