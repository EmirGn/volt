import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTickHabit } from '../../components/actions';
import { OfflineBanner } from '../../components/feedback';
import {
  Button,
  Card,
  CheckRow,
  Header,
  HeroNumber,
  MacroChip,
  ProgressLine,
  Row,
  Rows,
  Screen,
  Segmented,
  SmallButton,
  SwipeSegments,
  useRememberedSegment,
} from '../../components/ui';
import { useData } from '../../db/useData';
import {
  activeWorkout,
  eveningHint,
  foodForDay,
  getPlanItems,
  getTargets,
  habitsForDay,
  isoWeekday,
  MEALS,
  nextRoutine,
  startWorkout,
  todaysRoutine,
  totalsFor,
  weekWorkouts,
} from '../../db/queries';
import { fmtDate, fmtInt, proteinLabel, weekdayName } from '../../lib/format';
import { habitNudgeOn, setHabitNudge } from '../../lib/notifications';
import { color, type } from '../../theme';

type Tab = 'workout' | 'food' | 'tasks';

/** Workout until you've trained today or it's past 18:00, then Food. */
function smartTab(): Tab {
  const trained = weekWorkouts().some((w) => w.weekday === isoWeekday());
  return trained || new Date().getHours() >= 18 ? 'food' : 'workout';
}

export default function Today() {
  const [tab, setTab] = useRememberedSegment<Tab>('today', smartTab);
  const targets = useData(getTargets);
  const food = useData(() => foodForDay());
  const totals = totalsFor(food);
  const left = targets.kcal - totals.kcal;
  const hint = eveningHint(totals.kcal, targets.kcal);

  return (
    <Screen>
        <Header label={fmtDate()} icon="user" accessibilityLabel="Progress and profile" onPress={() => router.replace('/progress')} />
        <OfflineBanner />
        <HeroNumber
          value={fmtInt(Math.abs(left))}
          caption={
            hint ? `kcal left · ${hint}` : `${left >= 0 ? 'kcal left' : 'kcal over'} · ${fmtInt(totals.kcal)} of ${fmtInt(targets.kcal)} eaten`
          }
          below={<ProgressLine value={totals.protein} target={targets.protein} label={proteinLabel(totals.protein, targets.protein)} />}
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
        <SwipeSegments ids={['workout', 'food', 'tasks'] as Tab[]} value={tab} onChange={setTab}>
          {tab === 'workout' ? <WorkoutCard /> : null}
          {tab === 'food' ? <FoodCard /> : null}
          {tab === 'tasks' ? <TasksCard /> : null}
        </SwipeSegments>
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
  const tick = useTickHabit();
  const [nudge, setNudge] = useState(habitNudgeOn);
  return (
    <Card rows>
      <Rows>
        {habits.map((h) => (
          <CheckRow
            key={h.id}
            label={h.dose ? `${h.title} ${h.dose}` : h.title}
            meta={h.streak > 1 ? `${h.streak} day streak` : undefined}
            done={h.done}
            onToggle={() => tick(h, habits)}
          />
        ))}
        <Row
          title="Reminder at 21:30"
          subtitle={nudge ? 'Only when something is still open' : 'Off'}
          right={
            <SmallButton
              label={nudge ? 'Turn off' : 'Turn on'}
              onPress={() => {
                setNudge(!nudge);
                setHabitNudge(!nudge).catch(() => {});
              }}
            />
          }
        />
      </Rows>
    </Card>
  );
}
