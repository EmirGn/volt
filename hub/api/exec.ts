import { route } from '../lib/auth.js';
import { getDb, readJson, HttpError } from '../lib/db.js';
import { singleStatement, toStatement, type StatementIn } from '../lib/sql.js';

const MAX_STATEMENTS = 200;
const SCHEMA_CHANGE =
  /^\s*(CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
const SYNC_TABLES = /\b_(meta|counter|flag)\b/i;

// Writes, all in one write transaction. The change triggers record every row touched, so the phone pulls them.
// Cascades (routine → routine_exercises, workout → sets, habit → habit_logs) are done by hub triggers, since
// `PRAGMA foreign_keys` can't be switched on inside a transaction and the hub tables carry no foreign keys.
export async function POST(request: Request) {
  return route(request, async () => {
    const body = await readJson(request);
    const list: StatementIn[] | undefined = body?.statements;
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'Body must be { statements: {sql, args?}[] }');
    if (list.length > MAX_STATEMENTS) throw new HttpError(413, `At most ${MAX_STATEMENTS} statements`);
    const stmts = list.map(toStatement);
    for (const s of stmts) {
      const code = singleStatement(s.sql);
      if (SCHEMA_CHANGE.test(code))
        throw new HttpError(400, 'Schema, pragma and transaction statements are not allowed');
      if (SYNC_TABLES.test(code)) throw new HttpError(400, 'The sync tables (_meta, _counter, _flag) are off limits');
    }
    const db = await getDb();
    const tx = await db.transaction('write');
    try {
      const results = await tx.batch(stmts);
      await tx.commit();
      return {
        results: results.map((r) => ({
          rowsAffected: r.rowsAffected,
          lastInsertRowid: r.lastInsertRowid === undefined ? null : Number(r.lastInsertRowid),
        })),
      };
    } finally {
      tx.close();
    }
  });
}
