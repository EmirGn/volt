import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from './ids';

// Emir's plan v2 from 2026-10-18: push / pull twice a week, Mon/Tue/Thu/Fri, one leg movement at the end of
// each day, double progression. Compounds rest 2–3 min, isolations 1–2 min, supersets rest after the pair.
export const TIPS: Record<string, string> = {
  'Incline dumbbell press': 'Shoulder blades pinned, elbows about 45°. Ribs down, no arch.',
  'Machine shoulder press': 'Ribs down, back flat on the pad. Dumbbells are fine if the machine is taken.',
  'Cable fly': 'Soft elbows, squeeze for a second at the middle.',
  'Cable lateral raise': 'Lead with the elbow, stop at shoulder height. Shoulders away from your ears.',
  'Overhead cable triceps extension': 'Elbows pointing forward, full stretch behind your head.',
  'Leg press': 'Lower until your hips want to tuck, then drive.',
  'Lat pulldown': "Chest up, shoulders down, pull to your upper chest. Don't lean far back.",
  'Chest-supported machine row': 'Chest open, squeeze the shoulder blades first, then pull.',
  'Reverse pec deck': 'Think wide, not back. Shoulder blades back and down, head still.',
  'Bayesian cable curl': 'Face away from the cable, arm behind you. Full stretch at the bottom.',
  'Seated leg curl': 'Control the way back up, two seconds.',
  'Cable crunch': 'Curl your ribs to your hips, hips stay put. 60–90 s rest.',
  'Dumbbell shoulder press': 'Ribs down, press slightly in front of your face.',
  'Flat dumbbell bench press': 'Feet planted, touch the dumbbells to your chest line. A machine chest press works too.',
  'Pec deck': 'Soft elbows, chest up, squeeze for a second.',
  'Triceps pushdown': 'Elbows glued to your sides.',
  'Hack squat': 'Feet mid-platform, go deep with control. No hack squat? Use the leg press.',
  'Hanging leg raise': "Captain's chair or hanging. Curl the pelvis up, no swinging. 60–90 s rest.",
  'Seated cable row': 'Pause with the handle at your stomach, no torso swing.',
  'Assisted pull-up': 'Neutral grip. A neutral-grip pulldown works too. Shoulders down first.',
  'Face pull': 'Pull to your forehead, elbows high, shoulder blades back and down.',
  'Hammer curl': 'Thumbs up, no swinging.',
  'Dumbbell Romanian deadlift': 'Hinge at the hips, neutral spine and neck, stop when the hamstrings pull.',
};

type Item = [name: string, sets: number, min: number, max: number, rest: number, superset?: number];

export const ROUTINES: { name: string; focus: string; weekday: number; items: Item[] }[] = [
  {
    name: 'Push A',
    focus: 'Chest first',
    weekday: 1,
    items: [
      ['Incline dumbbell press', 3, 6, 10, 150],
      ['Machine shoulder press', 3, 8, 12, 120],
      ['Cable fly', 2, 10, 15, 90],
      ['Cable lateral raise', 3, 12, 20, 120, 1],
      ['Overhead cable triceps extension', 2, 10, 15, 120, 1],
      ['Leg press', 3, 8, 12, 150],
    ],
  },
  {
    name: 'Pull A',
    focus: 'Lats, vertical pull',
    weekday: 2,
    items: [
      ['Lat pulldown', 4, 6, 10, 150],
      ['Chest-supported machine row', 3, 8, 12, 120],
      ['Reverse pec deck', 2, 12, 20, 75],
      ['Cable lateral raise', 3, 12, 20, 120, 1],
      ['Bayesian cable curl', 2, 10, 15, 120, 1],
      ['Seated leg curl', 3, 10, 15, 90],
      ['Cable crunch', 3, 10, 15, 75],
    ],
  },
  {
    name: 'Push B',
    focus: 'Shoulders first',
    weekday: 4,
    items: [
      ['Dumbbell shoulder press', 3, 6, 10, 150],
      ['Flat dumbbell bench press', 3, 6, 10, 150],
      ['Pec deck', 2, 10, 15, 90],
      ['Cable lateral raise', 3, 12, 20, 120, 1],
      ['Triceps pushdown', 2, 10, 15, 120, 1],
      ['Hack squat', 3, 8, 12, 150],
      ['Hanging leg raise', 3, 8, 15, 75],
    ],
  },
  {
    name: 'Pull B',
    focus: 'Mid-back thickness',
    weekday: 5,
    items: [
      ['Seated cable row', 4, 6, 10, 150],
      ['Assisted pull-up', 3, 8, 12, 120],
      ['Face pull', 2, 12, 20, 75],
      ['Cable lateral raise', 3, 12, 20, 120, 1],
      ['Hammer curl', 2, 10, 12, 120, 1],
      ['Dumbbell Romanian deadlift', 3, 8, 10, 150],
    ],
  },
];

// Plan v1 names that are the same movement in v2. Renaming keeps their logged history.
const RENAMES: [from: string, to: string][] = [
  ['Cable row', 'Seated cable row'],
  ['Overhead triceps extension', 'Overhead cable triceps extension'],
  ['Dumbbell bench press', 'Flat dumbbell bench press'],
];

/**
 * Puts plan v2 in place. On a fresh database it creates everything; on an existing one it renames v1 exercises,
 * adds missing ones, and refills the routine on each plan weekday (renamed, same id, so past workouts stay linked).
 * Exercises and routines outside the plan are left alone. Does nothing once 'Push A' exists.
 */
export function applyPlan(db: SQLiteDatabase) {
  if (db.getFirstSync('SELECT 1 FROM routines WHERE name = ?', 'Push A')) return;

  for (const [from, to] of RENAMES) {
    if (!db.getFirstSync('SELECT 1 FROM exercises WHERE name = ?', to)) {
      db.runSync('UPDATE exercises SET name = ? WHERE name = ?', to, from);
    }
  }
  const exerciseId = new Map<string, number>();
  for (const [name, tip] of Object.entries(TIPS)) {
    const row = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE name = ?', name);
    if (row) {
      db.runSync('UPDATE exercises SET tip = ? WHERE id = ?', tip, row.id);
      exerciseId.set(name, row.id);
    } else {
      const id = newId();
      db.runSync('INSERT INTO exercises (id, name, tip) VALUES (?, ?, ?)', id, name, tip);
      exerciseId.set(name, id);
    }
  }

  ROUTINES.forEach((routine, i) => {
    const existing = db.getFirstSync<{ id: number }>('SELECT id FROM routines WHERE weekday = ? ORDER BY position LIMIT 1', routine.weekday);
    const routineId = existing?.id ?? newId();
    if (existing) {
      db.runSync('UPDATE routines SET name = ?, focus = ?, position = ? WHERE id = ?', routine.name, routine.focus, i, routineId);
      db.runSync('DELETE FROM routine_exercises WHERE routine_id = ?', routineId);
    } else {
      db.runSync(
        'INSERT INTO routines (id, name, focus, weekday, position) VALUES (?, ?, ?, ?, ?)',
        routineId,
        routine.name,
        routine.focus,
        routine.weekday,
        i,
      );
    }
    routine.items.forEach(([name, sets, min, max, rest, superset], pos) => {
      db.runSync(
        'INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets, rep_min, rep_max, rest_sec, superset) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newId(),
        routineId,
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
  // Routines from other days keep their places after the plan.
  db.runSync('UPDATE routines SET position = position + ? WHERE name NOT IN (?, ?, ?, ?)', ROUTINES.length, ...ROUTINES.map((r) => r.name));
}
