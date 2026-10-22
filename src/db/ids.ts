// Row ids that two writers (this phone and the hub) can both make without colliding.
// Time-ordered, about 1.8e15 today: below 2^53, so still an exact JS number, and above every
// old autoincrement id, so everything keeps sorting the same.
let lastId = 0;

export function newId(): number {
  const id = Math.max(lastId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000));
  lastId = id;
  return id;
}

/** Makes sure the next id is above `id`, e.g. the largest one already in the database. */
export function noteId(id: unknown) {
  if (typeof id === 'number' && Number.isFinite(id) && id > lastId) lastId = Math.floor(id);
}
