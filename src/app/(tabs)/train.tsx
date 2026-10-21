import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '../../components/Icon';
import { WorkoutRow } from '../../components/history';
import { Badge, Button, Card, EmptyNote, Header, HeroNumber, Row, Rows, Screen, Segmented, SwipeSegments, useRememberedSegment } from '../../components/ui';
import { useData } from '../../db/useData';
import {
  activeWorkout,
  createRoutine,
  exerciseBests,
  getRoutines,
  history,
  isoWeekday,
  nextRoutine,
  planWeek,
  prWorkoutIds,
  startWorkout,
  weekWorkouts,
  WEEKDAY_SHORT,
} from '../../db/queries';
import { fmtKg } from '../../lib/format';
import { color, font, type } from '../../theme';

type Tab = 'routines' | 'history' | 'exercises';

function begin(routineId: number) {
  const active = activeWorkout();
  const id = active ? active.id : startWorkout(routineId);
  router.push({ pathname: '/workout', params: { id: String(id) } });
}

export default function Train() {
  const [tab, setTab] = useRememberedSegment<Tab>('train', () => 'routines');
  const routines = useData(getRoutines);
  const week = useData(weekWorkouts);
  const planned = routines.filter((r) => r.weekday != null).length;
  const doneDays = new Set(week.map((w) => w.weekday));
  const today = isoWeekday();
  const weekNo = useData(planWeek);

  return (
    <Screen>
      <Header
        label="Train"
        icon="plus"
        accessibilityLabel="New routine"
        onPress={() => router.push({ pathname: '/routine/[id]', params: { id: String(createRoutine()) } })}
      />
      <HeroNumber value={String(week.length)} suffix={`/${planned}`} caption={`workouts this week · week ${weekNo} of your plan`}>
        {WEEKDAY_SHORT.map((d, i) => {
          const wd = i + 1;
          const done = doneDays.has(wd);
          const isToday = wd === today;
          return (
            <View
              key={d}
              accessibilityLabel={`${d}${done ? ', done' : ''}${isToday ? ', today' : ''}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: 34,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isToday ? color.volt : done ? color.ink : color.surface,
                borderWidth: isToday ? 2 : 0,
                borderColor: color.ink,
              }}
            >
              <Text
                style={{
                  fontFamily: isToday ? font.sansBold : font.sansSemi,
                  fontSize: 13,
                  color: isToday ? color.ink : done ? color.inkInverse : color.inkMuted,
                }}
              >
                {d[0]}
              </Text>
            </View>
          );
        })}
      </HeroNumber>
      <Segmented
        options={[
          { id: 'routines', label: 'Routines' },
          { id: 'history', label: 'History' },
          { id: 'exercises', label: 'Exercises' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <SwipeSegments ids={['routines', 'history', 'exercises'] as Tab[]} value={tab} onChange={setTab}>
        {tab === 'routines' ? <RoutinesCard /> : null}
        {tab === 'history' ? <HistoryCard /> : null}
        {tab === 'exercises' ? <ExercisesCard /> : null}
      </SwipeSegments>
    </Screen>
  );
}

function RoutinesCard() {
  const routines = useData(getRoutines);
  const next = useData(nextRoutine);
  const active = useData(activeWorkout);
  return (
    <Card style={{ paddingTop: 8 }}>
      <Rows>
        {routines.map((r) => (
          <Row
            key={r.id}
            title={r.name}
            subtitle={`${r.weekday ? WEEKDAY_SHORT[r.weekday - 1] : 'No day'} · ${r.exerciseCount} exercises · tap to edit`}
            minHeight={64}
            titleStyle={{ fontSize: 16 }}
            onPress={() => router.push({ pathname: '/routine/[id]', params: { id: String(r.id) } })}
            right={r.id === next?.id ? <Badge label="Next" /> : <Icon name="chevron" size={18} color={color.inkMuted} strokeWidth={2.2} />}
          />
        ))}
      </Rows>
      {active ? (
        <Button label={`Resume ${active.name}`} trailing="arrow" style={{ marginTop: 8 }} onPress={() => begin(active.routineId ?? 0)} />
      ) : next ? (
        <Button label={`Start ${next.name}`} trailing="arrow" style={{ marginTop: 8 }} onPress={() => begin(next.id)} />
      ) : null}
    </Card>
  );
}

function HistoryCard() {
  const rows = useData(() => history(8));
  const prs = useData(prWorkoutIds);
  if (!rows.length) {
    return (
      <Card rows>
        <EmptyNote>No finished workouts yet. Your first one shows up here.</EmptyNote>
      </Card>
    );
  }
  return (
    <Card rows>
      <Rows>
        {rows.map((w) => (
          <WorkoutRow key={w.id} w={w} pr={prs.has(w.id)} />
        ))}
      </Rows>
      <Button label="All history and graphs" variant="paper" trailing="arrow" height={48} style={{ marginVertical: 8 }} onPress={() => router.push('/history')} />
    </Card>
  );
}

function ExercisesCard() {
  const bests = useData(exerciseBests);
  if (!bests.length) {
    return (
      <Card rows>
        <EmptyNote>Best sets appear here once you log them.</EmptyNote>
      </Card>
    );
  }
  return (
    <Card rows>
      <Rows>
        {bests.map((b) => (
          <Row
            key={b.exerciseId}
            title={b.name}
            titleStyle={{ fontFamily: font.sansSemi }}
            value={`Best ${fmtKg(b.kg)} kg × ${b.reps}`}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(b.exerciseId) } })}
            right={<Icon name="chevron" size={16} color={color.inkMuted} strokeWidth={2.2} />}
          />
        ))}
      </Rows>
    </Card>
  );
}
