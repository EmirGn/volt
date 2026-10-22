import { route } from '../../lib/auth.js';
import { getDb, readJson, HttpError } from '../../lib/db.js';
import { push } from '../../lib/sync.js';

export async function POST(request: Request) {
  return route(request, async () => {
    const body = await readJson(request);
    if (!body || !Array.isArray(body.changes)) throw new HttpError(400, 'Body must be { changes: Change[] }');
    return push(await getDb(), body.changes);
  });
}
