// Phone side of the hub sync (HUB.md, "Phone sync"): push local changes, then pull the hub's.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import type { SQLiteBindValue } from 'expo-sqlite';
import { db, notify, subscribe } from '../db/db';
import { noteId } from '../db/ids';
import { isLocalSetting, keyOf, TABLE_BY_NAME, TABLES, type SyncTable } from './tables';

// The hub's address and token live only on this phone, in _sync: never in the build (the repo and its APKs are
// public) and never synced. They arrive once through the volt://hub link that `volt connect` shows as a QR code.
type HubConfig = { url: string; token: string };
let config: HubConfig | null = null;

function loadConfig() {
  const url = getSyncValue('hub_url');
  const token = getSyncValue('hub_token');
  config = url && token ? { url, token } : null;
  setStatus({ enabled: config !== null });
}

/** Without a hub, sync stays off and the app works exactly as before. */
export function isSyncEnabled() {
  return config !== null;
}

/**
 * Saves the hub this phone syncs with and syncs right away. Moving to a different hub starts it from scratch:
 * every local row goes up again and everything is pulled from the start.
 */
export function connectHub(url: string, token: string): Promise<boolean> {
  const clean = url.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(clean) || !token.trim()) {
    return Promise.reject(new Error('That hub link looks wrong.'));
  }
  if (getSyncValue('hub_url') !== clean) {
    setSyncValue('seq', '0');
    db.runSync('UPDATE _changes SET pushed = 0');
  }
  setSyncValue('hub_url', clean);
  setSyncValue('hub_token', token.trim());
  loadConfig();
  return syncNow();
}

export type Change = { t: string; k: string; at: number; op: 'put' | 'del'; row?: Record<string, unknown> };

const PAGE = 500;
const DEBOUNCE_MS = 4000;
const INTERVAL_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 20000;

// ---------- status ----------

export type SyncStatus = {
  enabled: boolean;
  syncing: boolean;
  /** When the last cycle finished without an error (ms), kept across launches. */
  lastOk: number | null;
  /** The last cycle's error, cleared by the next good one. */
  error: string | null;
};

let status: SyncStatus = { enabled: false, syncing: false, lastOk: null, error: null };
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
}

// ---------- local state ----------

function getSyncValue(key: string): string | null {
  return db.getFirstSync<{ value: string | null }>('SELECT value FROM _sync WHERE key = ?', key)?.value ?? null;
}

function setSyncValue(key: string, value: string) {
  db.runSync('INSERT INTO _sync (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

type Row = Record<string, SQLiteBindValue>;

const columnCache = new Map<string, Set<string>>();
function columnsOf(table: string): Set<string> {
  let cols = columnCache.get(table);
  if (!cols) {
    cols = new Set(db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name));
    columnCache.set(table, cols);
  }
  return cols;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const pkWhere = (t: SyncTable) => t.pk.map((c) => `${ident(c)} = ?`).join(' AND ');

function toBind(v: unknown): SQLiteBindValue {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return JSON.stringify(v);
}

function parseKey(t: SyncTable, k: string): SQLiteBindValue[] | null {
  try {
    const v = JSON.parse(k);
    return Array.isArray(v) && v.length === t.pk.length ? v.map(toBind) : null;
  } catch {
    return null;
  }
}

function readRow(t: SyncTable, k: string): Row | null {
  const pk = parseKey(t, k);
  return pk ? db.getFirstSync<Row>(`SELECT * FROM ${t.name} WHERE ${pkWhere(t)}`, pk) : null;
}

function recordChange(table: string, k: string, at: number, op: 'put' | 'del') {
  db.runSync(
    `INSERT INTO _changes (tbl, k, at, op, pushed) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(tbl, k) DO UPDATE SET at = excluded.at, op = excluded.op, pushed = 1`,
    table,
    k,
    at,
    op,
  );
}

// ---------- hub ----------

async function hub<T>(path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    if (!config) throw new Error('No hub');
    const res = await fetch(config.url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // not JSON; the status code says enough
    }
    if (!res.ok) {
      const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : '';
      throw new Error(msg || `Hub answered ${res.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- push ----------

// Puts parent-first, then deletes child-first, so the hub never sees a row before its parent.
const RANK = `CASE tbl ${TABLES.map((t, i) => `WHEN '${t.name}' THEN ${i}`).join(' ')} ELSE ${TABLES.length} END`;
const PUSH_ORDER = `(op = 'del'), CASE WHEN op = 'del' THEN -(${RANK}) ELSE ${RANK} END, at`;

async function push() {
  for (let round = 0; round < 200; round++) {
    const pending = db.getAllSync<{ tbl: string; k: string; at: number; op: 'put' | 'del' }>(
      `SELECT tbl, k, at, op FROM _changes WHERE pushed = 0 ORDER BY ${PUSH_ORDER} LIMIT ${PAGE}`,
    );
    if (!pending.length) return;
    const changes: Change[] = [];
    for (const p of pending) {
      const t = TABLE_BY_NAME.get(p.tbl);
      if (!t) continue;
      if (p.op === 'put') {
        const row = readRow(t, p.k);
        changes.push(row ? { t: p.tbl, k: p.k, at: p.at, op: 'put', row } : { t: p.tbl, k: p.k, at: p.at, op: 'del' });
      } else {
        changes.push({ t: p.tbl, k: p.k, at: p.at, op: 'del' });
      }
    }
    if (changes.length) await hub('/api/sync/push', { changes });
    // Only what went up: a row edited while the request was out keeps its newer, unpushed version.
    db.withTransactionSync(() => {
      for (const p of pending) {
        db.runSync('UPDATE _changes SET pushed = 1 WHERE tbl = ? AND k = ? AND at = ? AND op = ? AND pushed = 0', p.tbl, p.k, p.at, p.op);
      }
    });
  }
}

// ---------- pull ----------

const rankOf = (name: string) => TABLES.findIndex((t) => t.name === name);

/** Puts in parent-first order, deletes after them in reverse, keeping hub order within a table. */
function applyOrder(changes: Change[]) {
  const puts = changes.filter((c) => c.op !== 'del');
  const dels = changes.filter((c) => c.op === 'del');
  const byRank = (dir: 1 | -1) => (a: Change, b: Change) => dir * (rankOf(a.t) - rankOf(b.t));
  return [...puts.sort(byRank(1)), ...dels.sort(byRank(-1))];
}

function upsertRow(t: SyncTable, pk: SQLiteBindValue[], row: Record<string, unknown>) {
  const cols = columnsOf(t.name);
  const values: Row = {};
  for (const [c, v] of Object.entries(row)) if (cols.has(c)) values[c] = toBind(v);
  t.pk.forEach((c, i) => (values[c] = pk[i]));
  const names = Object.keys(values);
  const rest = names.filter((n) => !t.pk.includes(n));
  const onConflict = rest.length ? `DO UPDATE SET ${rest.map((n) => `${ident(n)} = excluded.${ident(n)}`).join(', ')}` : 'DO NOTHING';
  // Never INSERT OR REPLACE: that deletes first and would take children with it.
  db.runSync(
    `INSERT INTO ${t.name} (${names.map(ident).join(', ')}) VALUES (${names.map(() => '?').join(', ')})
     ON CONFLICT(${t.pk.map(ident).join(', ')}) ${onConflict}`,
    names.map((n) => values[n]),
  );
  if (t.pk.length === 1 && t.pk[0] === 'id') noteId(values.id);
}

function deleteRow(t: SyncTable, pk: SQLiteBindValue[], at: number) {
  // foreign_keys is off while applying, so children go by hand, and their versions say deleted too.
  for (const ch of t.children ?? []) {
    const child = TABLE_BY_NAME.get(ch.table);
    if (!child) continue;
    const kids = db.getAllSync<Row>(`SELECT ${child.pk.map(ident).join(', ')} FROM ${child.name} WHERE ${ident(ch.column)} = ?`, pk[0]);
    db.runSync(`DELETE FROM ${child.name} WHERE ${ident(ch.column)} = ?`, pk[0]);
    for (const kid of kids) recordChange(child.name, keyOf(child.pk.map((c) => kid[c])), at, 'del');
  }
  db.runSync(`DELETE FROM ${t.name} WHERE ${pkWhere(t)}`, pk);
}

/** Applies one pulled change. Returns whether local data changed. */
function applyOne(c: Change): boolean {
  const t = TABLE_BY_NAME.get(c.t);
  if (!t || typeof c.at !== 'number') return false;
  const pk = parseKey(t, c.k);
  if (!pk) return false;
  if (t.name === 'settings' && isLocalSetting(String(pk[0]))) return false;
  const k = keyOf(pk);
  const local = db.getFirstSync<{ at: number; op: string; pushed: number }>('SELECT at, op, pushed FROM _changes WHERE tbl = ? AND k = ?', t.name, k);
  if (local) {
    // A newer local edit that hasn't gone up yet wins; it goes up on the next push.
    if (local.pushed === 0 && local.at > c.at) return false;
    // Our own push coming back: the row is already exactly this.
    if (local.pushed === 1 && local.at === c.at && local.op === c.op) return false;
  }
  if (c.op === 'del') deleteRow(t, pk, c.at);
  else if (c.row && typeof c.row === 'object') upsertRow(t, pk, c.row);
  else return false;
  recordChange(t.name, k, c.at, c.op === 'del' ? 'del' : 'put');
  return true;
}

function applyPage(changes: Change[], seq: number | undefined): boolean {
  let changed = false;
  db.execSync('PRAGMA foreign_keys = OFF'); // a no-op inside a transaction, so it goes first
  try {
    db.withTransactionSync(() => {
      db.runSync('UPDATE _flag SET applying = 1');
      for (const c of applyOrder(changes)) if (applyOne(c)) changed = true;
      if (typeof seq === 'number') setSyncValue('seq', String(seq));
      db.runSync('UPDATE _flag SET applying = 0');
    });
  } finally {
    db.execSync('PRAGMA foreign_keys = ON');
  }
  return changed;
}

async function pull(): Promise<boolean> {
  let changed = false;
  for (let round = 0; round < 1000; round++) {
    const since = Number(getSyncValue('seq') ?? 0) || 0;
    const res = await hub<{ changes?: Change[]; seq?: number; more?: boolean }>(`/api/sync/pull?since=${since}&limit=${PAGE}`);
    const changes = Array.isArray(res?.changes) ? res.changes : [];
    if (applyPage(changes, res?.seq)) changed = true;
    if (!res?.more || res.seq == null || res.seq <= since) break;
  }
  return changed;
}

// ---------- the cycle ----------

let running: Promise<boolean> | null = null;
/** True while sync itself calls notify(), so pulled rows don't schedule another sync. */
let selfNotify = false;

/** Push, then pull. Never runs twice at once: a second call gets the running cycle. Resolves true on success. */
export function syncNow(): Promise<boolean> {
  if (!config) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    setStatus({ syncing: true });
    let changed = false;
    try {
      await push();
      changed = await pull();
      const now = Date.now();
      setSyncValue('last_ok', String(now));
      setStatus({ syncing: false, lastOk: now, error: null });
      return true;
    } catch (e) {
      // Quiet: the next trigger retries.
      setStatus({ syncing: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      running = null;
      if (changed) {
        selfNotify = true;
        try {
          notify();
        } finally {
          selfNotify = false;
        }
      }
    }
  })();
  return running;
}

let started = false;

/** Wires every trigger. Call once, after migrate(). */
export function startSync() {
  if (started) return;
  started = true;
  try {
    const last = Number(getSyncValue('last_ok'));
    if (last > 0) setStatus({ lastOk: last });
    loadConfig();
  } catch {
    // _sync missing would mean migrate() didn't run; sync then simply has nothing to show
  }
  // Triggers are wired even without a hub: syncNow() does nothing until connectHub() saves one.

  const run = () => void syncNow();
  // A write made while a cycle is out still needs its own push, so wait for that cycle and go again.
  const runAfterWrite = () => void (running ? running.then(() => syncNow()) : syncNow());

  let debounce: ReturnType<typeof setTimeout> | null = null;
  subscribe(() => {
    if (selfNotify) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      runAfterWrite();
    }, DEBOUNCE_MS);
  });

  let interval: ReturnType<typeof setInterval> | null = null;
  const startInterval = () => {
    if (!interval) interval = setInterval(run, INTERVAL_MS);
  };
  const stopInterval = () => {
    if (interval) clearInterval(interval);
    interval = null;
  };
  if (AppState.currentState !== 'background') startInterval();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      run();
      startInterval();
    } else if (state === 'background') {
      stopInterval();
      // Get a pending write up before the OS freezes us.
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
        runAfterWrite();
      }
    }
  });

  const isOnline = (s: Network.NetworkState) => s.isConnected === true && s.isInternetReachable !== false;
  let online: boolean | null = null;
  Network.getNetworkStateAsync()
    .then((s) => {
      if (online === null) online = isOnline(s);
    })
    .catch(() => {});
  Network.addNetworkStateListener((s) => {
    const now = isOnline(s);
    if (now && online === false) run();
    online = now;
  });

  run();
}
