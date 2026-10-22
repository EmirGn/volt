import { route } from '../lib/auth.js';
import { getDb } from '../lib/db.js';
import { schema } from '../lib/sync.js';

export async function GET(request: Request) {
  return route(request, async () => schema(await getDb()));
}
