# Volt hub

The phone stays the place where training happens: it logs offline, on its own SQLite, exactly like before.
The hub is a copy of the same data in the cloud. The phone syncs with it whenever it has internet, and Claude
reads and writes the hub through the `volt` CLI. Free to run: Vercel Hobby + Turso (serverless SQLite) from the
Vercel Marketplace.

```
phone (expo-sqlite)  ──push/pull──▶  hub (Vercel function + Turso)  ◀──  volt CLI  ◀──  Claude Code (volt skill)
```

Later, on top of the same hub: a remote MCP with MCP Apps views for claude.ai and the phone app, a weekly coach
agent, and the in-app Coach tab. None of that is in this round.

## Layout

| Path | What |
|------|------|
| `src/sync/` | Phone sync client (tables, triggers, push/pull, scheduling) |
| `hub/` | Vercel project, its own `package.json`. `api/*.ts` functions, `lib/` |
| `cli/volt.mjs` | The `volt` CLI. Node 22, no dependencies |
| `skills/volt/SKILL.md` | Claude Code skill, symlinked to `~/.claude/skills/volt` |

## Ids

SQLite autoincrement can't work with two writers, since both would pick `max + 1`. Rows created from now on get a
time-ordered id, made in the app by `newId()`:

```ts
id = max(lastId + 1, Date.now() * 1000 + random(0..999))   // ~1.8e15, below 2^53, still a JS number
```

Existing rows keep their small ids, and everything sorts the same. On the hub, an insert that leaves `id` out gets
`max + 1`, which is safe because the phone never uses `max + 1` again. The CLI also offers `volt id`.

## Synced tables

| Table | Key | Children (deleted with it) |
|-------|-----|----------------------------|
| exercises | id | |
| routines | id | routine_exercises |
| routine_exercises | id | |
| workouts | id | sets |
| sets | id | |
| food_presets | id | |
| food_entries | id | |
| habits | id | habit_logs |
| habit_logs | habit_id, day | |
| bodyweight | day | |
| settings | key | (only keys not in `LOCAL_SETTINGS` = `notifications_asked`, or starting with `hub_` / `local_`) |

The order above is the parent-first order. Puts are applied in that order, deletes in reverse.

A row's key, as text, is `JSON.stringify([pk values in order])`, e.g. `[1760000000000123]` or `[3,"2026-10-22"]`.

## Change record (the wire format)

```ts
type Change = { t: string; k: string; at: number; op: 'put' | 'del'; row?: Record<string, unknown> };
```

`at` is milliseconds since epoch, set by whoever made the change. Conflicts resolve as **last write wins per row, by
`at`**. Ties go to the incoming change.

## Hub API

All routes need `Authorization: Bearer $VOLT_TOKEN`. JSON in and out. Errors: `{ error }` with 4xx/5xx.

| Route | Body / query | Returns |
|-------|--------------|---------|
| `GET /api/health` | | `{ ok, seq, rows: {table: count} }` |
| `POST /api/sync/push` | `{ changes: Change[] }` (≤ 500) | `{ applied, skipped, seq }` |
| `GET /api/sync/pull` | `?since=<seq>&limit=500` | `{ changes: Change[], seq, more }` |
| `POST /api/query` | `{ sql, args? }` | `{ columns, rows }`. Read-only transaction |
| `POST /api/exec` | `{ statements: {sql, args?}[] }` | `{ results: {rowsAffected, lastInsertRowid}[] }`. One write transaction, `PRAGMA foreign_keys = ON` |
| `GET /api/schema` | | `{ tables: {name, columns: {name, type, notnull, pk}[]}[] }` |

### Hub database

- The same tables as the app's migration 1, created with `CREATE TABLE IF NOT EXISTS` on cold start.
- `_meta(tbl, k, at, deleted, seq, PRIMARY KEY (tbl, k))` holds the current version of every row the hub knows.
- `_counter(n)` is one row with the global sequence. Each change bumps it, and the row's `_meta.seq` takes the new value.
- `_flag(applying)` is one row. Triggers record nothing while `applying = 1`.
- AFTER INSERT/UPDATE/DELETE triggers on every synced table, `WHEN (SELECT applying FROM _flag) = 0`, bump the counter
  and upsert `_meta` with `at = now`. Deletes set `deleted = 1`. So any SQL Claude runs through `/api/exec` syncs to the
  phone automatically. For `settings`, the triggers skip local keys.
- **Push**: one write transaction. Set `applying = 1`, then for each change compare it with `_meta.at`. If
  `change.at >= stored.at` (or nothing is stored), apply it: an upsert
  `INSERT … ON CONFLICT(pk) DO UPDATE SET …` (never `INSERT OR REPLACE`, which would cascade), or a `DELETE` plus a
  manual delete of its children. Then write `_meta` with `change.at` and a new seq. Otherwise count it as skipped. Set
  `applying = 0` and commit.
  Table names and columns are whitelisted, and unknown columns are dropped.
- **Pull**: `SELECT … FROM _meta WHERE seq > ? ORDER BY seq LIMIT ?`, then the current row for each put.

## Phone sync

Migration 2 (in `src/db/db.ts`) creates:

- `_changes(tbl, k, at, op, pushed, PRIMARY KEY (tbl, k))`, the version of every local row. `pushed = 0` means it
  still has to go up.
- `_sync(key PRIMARY KEY, value)`, which holds `seq`, the last pulled hub sequence.
- `_flag(applying)`, plus the same kind of triggers as the hub, writing `_changes` with `at = now` and `pushed = 0`.
- A backfill: every existing row goes into `_changes` with `at = 1`, `op = 'put'`, `pushed = 0`, so the first push
  uploads everything and any real edit wins against it. The first-install seed is backfilled the same way.

Every `INSERT` in `queries.ts` and `seed.ts` passes `newId()` explicitly, and callers use that id instead of
`lastInsertRowId`.

**Sync cycle** (`src/sync/sync.ts`, `syncNow()`; it never runs twice at once):

1. **Push**: read `pushed = 0` in batches of 500, attach the current rows, and POST them. Then mark them pushed,
   but only where `at` didn't change in the meantime.
2. **Pull**: from `_sync.seq`, loop while `more`. For each change: if the local `_changes` row is unpushed and newer,
   skip it. Otherwise apply it inside one transaction with `applying = 1` and `PRAGMA foreign_keys` off (set outside
   the transaction). Puts are upserts, and deletes also delete their children. Write `_changes(at, op, pushed = 1)`
   and save the new seq. Call `notify()` when anything changed.

**When**: after `migrate()` on launch, when the app comes to the foreground, 4 s after the last local write
(debounced on `notify()`), every 2 min while open, and when the network comes back. Failures stay quiet, and the next
cycle retries.

**Config**: the hub URL and token are kept only on the phone, in `_sync` (`hub_url`, `hub_token`). They're never in
the build, because the repo and its APKs are public, and they're never synced. They arrive once through
`volt://hub?url=…&token=…`: `volt connect` shows that link as a QR code on the Mac, and the phone's camera opens it in
Volt (`src/app/hub.tsx` → `connectHub()`). Without a hub, sync is off and the app behaves exactly as before.

**UI**: one quiet line at the bottom of Progress, in the house style: "Synced · 2 min ago", "Sync off", or
"Couldn't sync · tap to retry". Tapping it syncs now. Nothing else changes.

## CLI

`volt` reads `VOLT_HUB_URL` / `VOLT_HUB_TOKEN` from the environment or from `~/.volt/hub.env`.

```
volt status                       hub health, row counts
volt schema                       tables and columns
volt sql "<select>" [--json]      read anything
volt exec "<sql>" ["<sql>" …]     write, in one transaction
volt today                        planned routine, food vs targets, habits, last workout
volt week                         this week's workouts, volume, kcal average, bodyweight
volt exercise "<name>"            every session, best set, e1RM trend (Epley kg × (1 + reps/30))
volt log food "<name>" --kcal N [--protein N --carbs N --fat N --meal lunch --day YYYY-MM-DD]
volt log weight <kg> [--day YYYY-MM-DD]
volt id                           a fresh row id
volt connect                      QR code that connects the phone app to the hub
```

## Security

There's a single user and a single token. The token is in Vercel env (`VOLT_TOKEN`), `~/.volt/hub.env` and the
phone's `_sync` table, and never in git, builds or notes. To rotate it, put a new token in Vercel and in
`~/.volt/hub.env`, redeploy, then scan `volt connect` again.
