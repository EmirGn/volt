import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from './ids';
import { applyPlan } from './plan';

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
  applyPlan(db);
  PRESETS.forEach(([name, detail, kcal, p, c, f]) => {
    db.runSync(
      'INSERT INTO food_presets (id, name, detail, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId(),
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
    db.runSync('INSERT INTO habits (id, kind, title, dose, position) VALUES (?, ?, ?, ?, ?)', newId(), kind, title, dose, i),
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
