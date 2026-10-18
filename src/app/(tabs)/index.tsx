import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  Card,
  CheckRow,
  Header,
  HeroNumber,
  MacroChip,
  Row,
  Rows,
  Screen,
  Segmented,
  SmallButton,
} from '../../components/ui';
import { useData } from '../../db/useData';
import {
  activeWorkout,
  foodForDay,
  getPlanItems,
  getTargets,
  habitsForDay,
  isoWeekday,
  MEALS,
  nextRoutine,
  startWorkout,
  todaysRoutine,
  toggleHabit,
  totalsFor,
  weekWorkouts,
} from '../../db/queries';
import { fmtDate, fmtInt, weekdayName } from '../../lib/format';
import { color, type } from '../../theme';

type Tab = 'workout' | 'food' | 'tasks';

export default function Today() {
  const [tab, setTab] = useState<Tab>('workout');
  const targets = useData(getTargets);
  const food = useData(() => foodForDay());
  const totals = totalsFor(food);
  const left = targets.kcal - totals.kcal;

  return (
    <Screen>
        <Header label={fmtDate()} icon="user" accessibilityLabel="Progress and profile" onPress={() => router.replace('/progress')} />
        <HeroNumber
          value={fmtInt(Math.abs(left))}
          caption={`${left >= 0 ? 'kcal left' : 'kcal over'} · ${fmtInt(totals.kcal)} of ${fmtInt(targets.kcal)} eaten`}
        >
          <MacroChip letter="P" value={totals.protein} target={targets.protein} />
          <MacroChip letter="C" value={totals.carbs} target={targets.carbs} />
          <MacroChip letter="F" value={totals.fat} target={targets.fat} />
        </HeroNumber>
        <Segmented
          options={[
            { id: 'workout', label: 'Workout' },
            { id: 'food', label: 'Food' },
            { id: 'tasks', label: 'Tasks' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'workout' ? <WorkoutCard /> : null}
        {tab === 'food' ? <FoodCard /> : null}
        {tab === 'tasks' ? <TasksCard /> : null}
    </Screen>
  );
}

function WorkoutCard() {
  const active = useData(activeWorkout);
  const today = useData(todaysRoutine);
  const next = useData(nextRoutine);
  const doneToday = useData(() => weekWorkouts().some((w) => w.weekday === isoWeekday()));

  const routine = active ? null : today && !doneToday ? today : next;
  const routineId = active?.routineId ?? routine?.id ?? null;
  const items = useData(() => (routineId ? getPlanItems(routineId) : []), [routineId]);
  const minutes = Math.round(items.reduce((m, i) => m + i.sets * (i.restSec + 45), 0) / 60 / 5) * 5;

  let title = routine?.name ?? 'No routine';
  let meta = '';
  let cta = 'Start workout';
  if (active) {
    title = active.name;
    meta = `Started ${new Date(active.startedAt).toTimeString().slice(0, 5)}`;
    cta = 'Resume workout';
  } else if (routine && routine === today && !doneToday) {
    meta = `Today · ${minutes} min`;
  } else if (routine) {
    meta = `${doneToday ? 'Done today' : 'Rest day'} · next ${weekdayName(routine.weekday ?? 1)}`;
    cta = `Start ${routine.name} early`;
  }

  const shown = items.slice(0, 3);
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 8 }}>
        <Text style={type.title}>{title}</Text>
        <Text style={[type.caption, { fontSize: 14 }]}>{meta}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: color.line }} />
      <Rows>
        {shown.map((i) => (
          <Row key={i.id} title={i.name} value={`${i.sets} × ${i.repMin}–${i.repMax}`} minHeight={44} />
        ))}
        {items.length > shown.length ? (
          <Row title={`+ ${items.length - shown.length} more`} titleStyle={{ color: color.inkMuted }} minHeight={44} />
        ) : null}
      </Rows>
      {routineId ? (
        <Button
          label={cta}
          trailing="arrow"
          style={{ marginTop: 8 }}
          onPress={() => {
            const id = active ? active.id : startWorkout(routineId);
            router.push({ pathname: '/workout', params: { id: String(id) } });
          }}
        />
      ) : null}
    </Card>
  );
}

function FoodCard() {
  const food = useData(() => foodForDay());
  const firstEmpty = MEALS.find((m) => !food.some((f) => f.meal === m.id))?.id;
  return (
    <Card rows>
      <Rows>
        {MEALS.map((m) => {
          const entries = food.filter((f) => f.meal === m.id);
          const kcal = entries.reduce((s, e) => s + e.kcal, 0);
          return (
            <Row
              key={m.id}
              title={m.label}
              subtitle={entries.length ? entries.map((e) => e.name).join(', ') : undefined}
              titleStyle={{ fontFamily: type.lead.fontFamily }}
              right={
                entries.length ? (
                  <Text style={[type.body, { fontFamily: type.lead.fontFamily }]}>{fmtInt(kcal)}</Text>
                ) : (
                  <SmallButton
                    label="Add"
                    volt={m.id === firstEmpty}
                    onPress={() => router.push({ pathname: '/add-food', params: { meal: m.id } })}
                  />
                )
              }
              onPress={entries.length ? () => router.push({ pathname: '/add-food', params: { meal: m.id } }) : undefined}
            />
          );
        })}
      </Rows>
    </Card>
  );
}

function TasksCard() {
  const habits = useData(() => habitsForDay());
  return (
    <Card rows>
      <Rows>
        {habits.map((h) => (
          <CheckRow
            key={h.id}
            label={h.dose ? `${h.title} ${h.dose}` : h.title}
            meta={h.streak > 1 ? `${h.streak} day streak` : undefined}
            done={h.done}
            onToggle={() => toggleHabit(h.id)}
          />
        ))}
      </Rows>
    </Card>
  );
}
