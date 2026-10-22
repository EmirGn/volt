import { route } from '../lib/auth.js';
import { getDb, readJson, HttpError } from '../lib/db.js';
import { singleStatement, table, toStatement } from '../lib/sql.js';

const READ = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA|VALUES)\b/i;
const WRITE = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b/i;

// Read anything: one statement, in a read-only transaction that is rolled back, never committed. The keyword check
// is a second guard, since a local `file:` database doesn't enforce READONLY transactions (Turso does).
export async function POST(request: Request) {
  return route(request, async () => {
    const body = await readJson(request);
    if (!body || typeof body.sql !== 'string') throw new HttpError(400, 'Body must be { sql, args? }');
    const stmt = toStatement(body);
    const code = singleStatement(stmt.sql);
    if (!READ.test(code) || WRITE.test(code) || (/^\s*PRAGMA\b/i.test(code) && code.includes('='))) {
      throw new HttpError(400, 'Read-only: use /api/exec to write');
    }
    const tx = await (await getDb()).transaction('read');
    try {
      const rs = await tx.execute(stmt);
      await tx.rollback();
      return table(rs);
    } finally {
      tx.close();
    }
  });
}
