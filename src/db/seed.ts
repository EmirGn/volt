import type { SQLiteDatabase } from 'expo-sqlite';

// Emir's plan from 2026-10-15: upper/lower, Mon/Tue/Thu/Fri, double progression.
const TIPS: Record<string, string> = {
  'Incline dumbbell press': 'Shoulder blades pinned, elbows about 45°.',
  'Lat pulldown': 'Chest up, pull the bar to your upper chest.',
  'Dumbbell shoulder press': 'Ribs down, press slightly in front of your face.',
  'Cable row': 'Pause with the handle at your stomach, no torso swing.',
  'Cable fly': 'Soft elbows, squeeze for a second at the middle.',
  'Cable lateral raise': 'Lead with the elbow, stop at shoulder height.',
  'Triceps pushdown': 'Elbows glued to your sides.',
  'Incline dumbbell curl': 'Let the arm hang fully at the bottom. Go light at first.',
  'Leg press': 'Lower until your hips want to tuck, then drive.',
  'Seated leg curl': 'Control the way back up, two seconds.',
  'Leg extension': 'Pause at the top, slow on the way down.',
  'Reverse pec deck': 'Think wide, not back. Light weight, high reps.',
  'Hammer curl': 'Thumbs up, no swinging.',
  'Overhead triceps extension': 'Elbows pointing forward, full stretch.',
  'Dumbbell bench press': 'Feet planted, touch the dumbbells to your chest line.',
};

type Item = [name: string, sets: number, min: number, max: number, rest: number, superset?: number];

const ROUTINES: { name: string; focus: string; weekday: number; items: Item[] }[] = [
  {
    name: 'Upper A',
    focus: 'Chest, back, shoulders, arms',
    weekday: 1,
    items: [
      ['Incline dumbbell press', 4, 6, 10, 150],
      ['Lat pulldown', 3, 8, 12, 120],
      ['Dumbbell shoulder press', 3, 8, 12, 120],
      ['Cable row', 3, 8, 12, 120],
      ['Cable fly', 3, 10, 15, 90],
      ['Cable lateral raise', 3, 12, 20, 60],
      ['Triceps pushdown', 2, 10, 15, 60, 1],
      ['Incline dumbbell curl', 2, 10, 15, 60, 1],
    ],
  },
  {
    name: 'Legs A',
    focus: 'Legs, then shoulders and arms',
    weekday: 2,
    items: [
      ['Leg press', 4, 8, 12, 150],
      ['Seated leg curl', 3, 8, 12, 90],
      ['Leg extension', 2, 12, 15, 90],
      ['Cable lateral raise', 3, 12, 20, 60],
      ['Reverse pec deck', 3, 12, 20, 60],
      ['Hammer curl', 3, 10, 12, 75],
      ['Overhead triceps extension', 3, 10, 15, 75],
    ],
  },
  {
    name: 'Upper B',
    focus: 'Heavy pulldown, flat press',
    weekday: 4,
    items: [
      ['Lat pulldown', 4, 6, 10, 150],
      ['Dumbbell bench press', 4, 6, 10, 150],
      ['Cable row', 3, 8, 12, 120],
      ['Cable fly', 3, 10, 15, 90],
      ['Cable lateral raise', 3, 12, 20, 60],
      ['Incline dumbbell curl', 3, 10, 15, 60, 1],
      ['Overhead triceps extension', 3, 10, 15, 60, 1],
    ],
  },
  {
    name: 'Legs B',
    focus: 'Hamstrings first, then upper',
    weekday: 5,
    items: [
      ['Seated leg curl', 3, 8, 12, 90],
      ['Leg press', 3, 10, 15, 120],
      ['Leg extension', 2, 12, 15, 90],
      ['Cable lateral raise', 3, 12, 20, 60],
      ['Reverse pec deck', 2, 12, 20, 60],
      ['Hammer curl', 3, 10, 15, 60, 1],
      ['Triceps pushdown', 3, 10, 15, 60, 1],
    ],
  },
];

// Rough numbers for food he eats every week. Dorm and uni meals are estimates on purpose.
const PRESETS: [string, string, number, number, number, number][] = [
  ['Mass shake', 'Milk, whey, oats, banana, peanut butter', 950, 55, 110, 30],
  ['Dorm breakfast', 'Usual plate, estimate', 600, 25, 70, 22],
  ['Uni lunch', 'Cafeteria tray, estimate', 800, 35, 95, 28],
  ['Dorm dinner', 'Usual plate, estimate', 750, 35, 85, 26],
  ['Greek yogurt', '200 g', 146, 20, 8, 4],
  ['Ayran', '250 ml', 90, 5, 6, 5],
  ['Banana', '1 medium', 105, 1, 27, 0],
  ['Milk', '400 ml', 250, 13, 19, 13],
];

export function seed(db: SQLiteDatabase) {
  const exerciseId = new Map<string, number>();
  for (const [name, tip] of Object.entries(TIPS)) {
    const r = db.runSync('INSERT INTO exercises (name, tip) VALUES (?, ?)', name, tip);
    exerciseId.set(name, r.lastInsertRowId);
  }
  ROUTINES.forEach((routine, i) => {
    const r = db.runSync(
      'INSERT INTO routines (name, focus, weekday, position) VALUES (?, ?, ?, ?)',
      routine.name,
      routine.focus,
      routine.weekday,
      i,
    );
    routine.items.forEach(([name, sets, min, max, rest, superset], pos) => {
      db.runSync(
        'INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, rep_min, rep_max, rest_sec, superset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        r.lastInsertRowId,
        exerciseId.get(name)!,
        pos,
        sets,
        min,
        max,
        rest,
        superset ?? null,
      );
    });
  });
  PRESETS.forEach(([name, detail, kcal, p, c, f]) => {
    db.runSync(
      'INSERT INTO food_presets (name, detail, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?)',
      name,
      detail,
      kcal,
      p,
      c,
      f,
    );
  });
  const habits: [string, string, string][] = [
    ['supplement', 'Creatine', '5 g'],
    ['supplement', 'Whey protein', '1 scoop'],
    ['task', 'Drink 3 L of water', ''],
    ['task', '10-minute stretch', ''],
    ['task', 'Yogurt or milk before bed', ''],
  ];
  habits.forEach(([kind, title, dose], i) =>
    db.runSync('INSERT INTO habits (kind, title, dose, position) VALUES (?, ?, ?, ?)', kind, title, dose, i),
  );
  const settings: [string, string][] = [
    ['kcal_target', '3100'],
    ['protein_target', '140'],
    ['carbs_target', '430'],
    ['fat_target', '90'],
    ['plan_start', '2026-10-12'],
    ['kg_step', '2.5'],
  ];
  settings.forEach(([k, v]) => db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', k, v));
  db.runSync("INSERT INTO bodyweight (day, kg) VALUES ('2026-10-15', 68)");
}
