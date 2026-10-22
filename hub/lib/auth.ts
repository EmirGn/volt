import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError, json } from './db.js';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Bearer check against VOLT_TOKEN. Without a VOLT_TOKEN the hub refuses everything. */
export function checkAuth(request: Request) {
  const token = process.env.VOLT_TOKEN;
  if (!token) throw new HttpError(500, 'VOLT_TOKEN is not set on the hub');
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  // Hashing first makes both sides the same length, so the compare is constant-time.
  if (!given || !timingSafeEqual(digest(given), digest(token))) throw new HttpError(401, 'Unauthorized');
}

/** Runs a route: auth first, then `{ error }` JSON for anything that goes wrong. */
export async function route(request: Request, fn: () => Promise<unknown>): Promise<Response> {
  try {
    checkAuth(request);
    return json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    const message = e instanceof Error ? e.message : String(e);
    // SQLite errors from Claude's SQL are the caller's fault; anything else is ours.
    const sqlish = /SQLITE_|SQL_PARSE|no such (table|column)|syntax error|constraint|readonly|read-only/i.test(message);
    if (!sqlish) console.error(e);
    return json({ error: message }, sqlish ? 400 : 500);
  }
}
