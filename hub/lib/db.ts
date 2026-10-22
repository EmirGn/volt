import { createClient, type Client } from '@libsql/client';
import { ensureSchema } from './schema.js';

let client: Client | null = null;

/** Turso's marketplace names first, then our own. `file:` URLs work too (local tests). */
function config() {
  const url = process.env.TURSO_DATABASE_URL || process.env.VOLT_DB_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.VOLT_DB_TOKEN || undefined;
  if (!url) throw new HttpError(500, 'Database is not configured (TURSO_DATABASE_URL or VOLT_DB_URL)');
  return { url, authToken };
}

/** The shared client, with the schema in place. */
export async function getDb(): Promise<Client> {
  if (!client) client = createClient(config());
  await ensureSchema(client);
  return client;
}

/** For tests: drop the client so the next getDb() reads the env again. */
export function resetDb() {
  client?.close();
  client = null;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** JSON-safe values: BigInt becomes a number, ArrayBuffer a byte array. */
export function plain(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v));
  return v;
}

export function json(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body, (_k, v) => plain(v)),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}

export async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}
