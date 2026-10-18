import { useMemo, useSyncExternalStore } from 'react';
import { getRevision, subscribe } from './db';

/** Re-runs a synchronous query whenever anything is written to the database. */
export function useData<T>(query: () => T, deps: unknown[] = []): T {
  const revision = useSyncExternalStore(subscribe, getRevision);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(query, [revision, ...deps]);
}
