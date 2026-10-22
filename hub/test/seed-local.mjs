// Pushes realistic data into a running hub (test/serve.mjs), the way the phone would after its backfill:
// the app's first-install seed plus three weeks of training, food, habits and bodyweight.
//   node test/seed-local.mjs [http://localhost:8787] [token]
const url = process.argv[2] ?? 'http://localhost:8787';
const token = process.argv[3] ?? process.env.VOLT_TOKEN ?? 'dev';

let n = 0;
const id = () => Date.now() * 1000 - 5e9 + n++; // time-ordered, like newId()
const changes = [];
const put = (t, row, pk = ['id']) =>
  changes.push({ t, k: JSON.stringify(pk.map((c) => row[c])), at: 1, op: 'put', row });

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoWeekday = (d) => ((d.getDay() + 6) % 7) + 1;

const exercises = {};
for (const name of [
  'Incline dumbbell press',
  'Lat pulldown',
  'Dumbbell shoulder press',
  'Cable row',
  'Cable fly',
  'Cable lateral raise',
  'Triceps pushdown',
  'Incline dumbbell curl',
  'Leg press',
  'Seated leg curl',
  'Leg extension',
  'Reverse pec deck',
  'Hammer curl',
  'Overhead triceps extension',
  'Dumbbell bench press',
]) {
  exercises[name] = id();
  put('exercises', { id: exercises[name], name, tip: null });
}

const ROUTINES = [
  [
    'Upper A',
    'Chest, back, shoulders, arms',
    1,
    [
      ['Incline dumbbell press', 4, 6, 10, 150, 20],
      ['Lat pulldown', 3, 8, 12, 120, 45],
      ['Dumbbell shoulder press', 3, 8, 12, 120, 14],
      ['Cable row', 3, 8, 12, 120, 40],
      ['Triceps pushdown', 2, 10, 15, 60, 20, 1],
      ['Incline dumbbell curl', 2, 10, 15, 60, 8, 1],
    ],
  ],
  [
    'Legs A',
    'Legs, then shoulders and arms',
    2,
    [
      ['Leg press', 4, 8, 12, 150, 100],
      ['Seated leg curl', 3, 8, 12, 90, 35],
      ['Leg extension', 2, 12, 15, 90, 30],
      ['Hammer curl', 3, 10, 12, 75, 10],
    ],
  ],
  [
    'Upper B',
    'Heavy pulldown, flat press',
    4,
    [
      ['Lat pulldown', 4, 6, 10, 150, 50],
      ['Dumbbell bench press', 4, 6, 10, 150, 22.5],
      ['Cable row', 3, 8, 12, 120, 40],
      ['Cable lateral raise', 3, 12, 20, 60, 5],
    ],
  ],
  [
    'Legs B',
    'Hamstrings first, then upper',
    5,
    [
      ['Seated leg curl', 3, 8, 12, 90, 35],
      ['Leg press', 3, 10, 15, 120, 90],
      ['Reverse pec deck', 2, 12, 20, 60, 25],
    ],
  ],
];

const today = new Date();
ROUTINES.forEach(([name, focus, weekday, items], position) => {
  const rid = id();
  put('routines', { id: rid, name, focus, weekday, position });
  items.forEach(([ex, sets, rep_min, rep_max, rest_sec, , superset], i) =>
    put('routine_exercises', {
      id: id(),
      routine_id: rid,
      exercise_id: exercises[ex],
      position: i,
      sets,
      rep_min,
      rep_max,
      rest_sec,
      superset: superset ?? null,
    }),
  );
  // Three weeks back, every planned day before today: a finished workout, getting a bit stronger each week.
  for (let back = 21; back >= 1; back--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 17, 10);
    if (isoWeekday(d) !== weekday) continue;
    const week = Math.floor((21 - back) / 7);
    const wid = id();
    let t = d.getTime();
    put('workouts', { id: wid, routine_id: rid, name, started_at: t, finished_at: t + 65 * 60000 });
    for (const [ex, sets, rep_min, rep_max, , kg] of items) {
      for (let s = 1; s <= sets; s++) {
        t += 3 * 60000;
        const reps = Math.min(rep_max, rep_min + week * 2 + (s === 1 ? 1 : 0));
        put('sets', {
          id: id(),
          workout_id: wid,
          exercise_id: exercises[ex],
          set_index: s,
          kg: kg + (week === 2 ? 2.5 : 0),
          reps,
          done_at: t,
        });
      }
    }
  }
});

const habits = [
  ['supplement', 'Creatine', '5 g'],
  ['supplement', 'Whey protein', '1 scoop'],
  ['task', 'Drink 3 L of water', ''],
  ['task', '10-minute stretch', ''],
];
const habitIds = habits.map(([kind, title, dose], position) => {
  const hid = id();
  put('habits', { id: hid, kind, title, dose, position, archived: 0 });
  return hid;
});

const MEALS = [
  ['breakfast', 'Dorm breakfast', 600, 25, 70, 22],
  ['lunch', 'Uni lunch', 800, 35, 95, 28],
  ['dinner', 'Dorm dinner', 750, 35, 85, 26],
  ['snacks', 'Mass shake', 950, 55, 110, 30],
];
for (let back = 10; back >= 0; back--) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 9);
  const day = dayKey(d);
  MEALS.forEach(([meal, name, kcal, protein, carbs, fat], i) => {
    if (back === 0 && i > 1) return; // today is still going
    if (back % 4 === 1 && meal === 'snacks') return; // skipped the shake now and then
    put('food_entries', {
      id: id(),
      day,
      meal,
      name,
      kcal,
      protein,
      carbs,
      fat,
      created_at: d.getTime() + i * 4 * 3600000,
    });
  });
  habitIds.forEach((hid, i) => {
    if ((back + i) % 3 !== 0 || back === 0)
      put('habit_logs', { habit_id: hid, day, done_at: d.getTime() }, ['habit_id', 'day']);
  });
  if (back % 2 === 0) put('bodyweight', { day, kg: 68 + (10 - back) * 0.08 }, ['day']);
}

for (const [key, value] of [
  ['kcal_target', '3100'],
  ['protein_target', '140'],
  ['carbs_target', '430'],
  ['fat_target', '90'],
  ['plan_start', '2026-10-12'],
  ['kg_step', '2.5'],
  ['notifications_asked', '1'],
]) {
  put('settings', { key, value }, ['key']);
}

let applied = 0;
for (let i = 0; i < changes.length; i += 500) {
  const res = await fetch(`${url}/api/sync/push`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ changes: changes.slice(i, i + 500) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`push failed: ${res.status} ${JSON.stringify(body)}`);
  applied += body.applied;
}
console.log(`pushed ${changes.length} changes, applied ${applied}`);
