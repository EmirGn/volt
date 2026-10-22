import { route } from '../../lib/auth.js';
import { getDb, HttpError } from '../../lib/db.js';
import { pull, MAX_CHANGES } from '../../lib/sync.js';

export async function GET(request: Request) {
  return route(request, async () => {
    const params = new URL(request.url).searchParams;
    const since = Number(params.get('since') ?? 0);
    const limit = Number(params.get('limit') ?? MAX_CHANGES);
    if (!Number.isSafeInteger(since) || since < 0) throw new HttpError(400, '`since` must be a sequence number >= 0');
    if (!Number.isSafeInteger(limit) || limit < 1) throw new HttpError(400, '`limit` must be a positive integer');
    return pull(await getDb(), since, Math.min(limit, MAX_CHANGES));
  });
}
