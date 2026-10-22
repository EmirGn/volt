// A local stand-in for `vercel dev`: mounts the route handlers on node:http with a file: database.
//   cd hub && VOLT_TOKEN=dev npm run serve            (http://localhost:8787, ./local.db)
//   PORT=9000 VOLT_DB_URL=file:/tmp/x.db VOLT_TOKEN=dev npm run serve
import { createServer } from 'node:http';
import { resolve } from 'node:path';

process.env.VOLT_DB_URL ??= `file:${resolve(import.meta.dirname, '..', 'local.db')}`;
process.env.VOLT_TOKEN ??= 'dev';
const port = Number(process.env.PORT ?? 8787);

const routes = {
  '/api/health': await import('../api/health.ts'),
  '/api/schema': await import('../api/schema.ts'),
  '/api/sync/push': await import('../api/sync/push.ts'),
  '/api/sync/pull': await import('../api/sync/pull.ts'),
  '/api/query': await import('../api/query.ts'),
  '/api/exec': await import('../api/exec.ts'),
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const mod = routes[url.pathname];
  const fn = mod?.[req.method];
  let response;
  if (!fn) {
    response = Response.json({ error: mod ? 'Method not allowed' : 'Not found' }, { status: mod ? 405 : 404 });
  } else {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    response = await fn(new Request(url, { method: req.method, headers: req.headers, body }));
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  console.log(`${req.method} ${url.pathname}${url.search} → ${response.status}`);
}).listen(port, () => console.log(`volt hub on http://localhost:${port} (${process.env.VOLT_DB_URL})`));
