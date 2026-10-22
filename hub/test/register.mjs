// Lets Node (with its built-in type stripping) run the hub's TypeScript as-is: the sources import `./x.js`, the
// way Vercel's build wants, so map those to the `.ts` file next to it when there's no `.js`.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        try {
          return await next(spec, ctx);
        } catch (e) {
          if (spec.startsWith('.') && spec.endsWith('.js')) return next(spec.slice(0, -3) + '.ts', ctx);
          throw e;
        }
      }`),
);
