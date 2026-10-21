import { Fragment, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Sparkline } from '../../components/Chart';
import { byWeek, WorkoutRow } from '../../components/history';
import { Icon } from '../../components/Icon';
import { BackHeader, Card, Chip, EmptyNote, HeroNumber, Rows, Screen, Segmented, SwipeSegments } from '../../components/ui';
import { useData } from '../../db/useData';
import { exerciseOverview, history, historyTotals, prWorkoutIds } from '../../db/queries';
import { fmtDate, fmtKg, fmtTonnes } from '../../lib/format';
import { color, font, type } from '../../theme';

type Tab = 'workouts' | 'exercises';

export default function History() {
  const [tab, setTab] = useState<Tab>('workouts');
  const totals = useData(historyTotals);

  return (
    <Screen bottom={40}>
      <BackHeader label="History" onBack={() => router.back()} />
      <HeroNumber
        value={String(totals.count)}
        caption={totals.first ? `workouts since ${fmtDate(new Date(totals.first)).slice(5)} · ${fmtTonnes(totals.volume)} lifted` : 'workouts so far'}
      >
        {totals.prsThisMonth ? <Chip label={`${totals.prsThisMonth} new ${totals.prsThisMonth === 1 ? 'best' : 'bests'} this month`} volt /> : null}
        {totals.count ? <Chip label={`${totals.perWeek.toFixed(1)} a week`} /> : null}
      </HeroNumber>
      <Segmented
        options={[
          { id: 'workouts', label: 'Workouts' },
          { id: 'exercises', label: 'Exercises' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <SwipeSegments ids={['workouts', 'exercises'] as Tab[]} value={tab} onChange={setTab}>
        {tab === 'workouts' ? <WorkoutsCard /> : <ExercisesCard />}
      </SwipeSegments>
    </Screen>
  );
}

function WorkoutsCard() {
  const rows = useData(() => history(500));
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
      {byWeek(rows).map((g) => (
        <Fragment key={g.label}>
          <Text style={[type.label, { paddingTop: 14, paddingBottom: 2 }]}>
            {g.label} · {g.rows.length}
          </Text>
          <Rows>
            {g.rows.map((w) => (
              <WorkoutRow key={w.id} w={w} pr={prs.has(w.id)} />
            ))}
          </Rows>
        </Fragment>
      ))}
    </Card>
  );
}

function ExercisesCard() {
  const list = useData(exerciseOverview);
  if (!list.length) {
    return (
      <Card rows>
        <EmptyNote>Exercises appear here once you finish a workout.</EmptyNote>
      </Card>
    );
  }
  return (
    <Card rows>
      <Rows>
        {list.map((e) => (
          <Pressable
            key={e.exerciseId}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(e.exerciseId) } })}
            accessibilityRole="button"
            accessibilityLabel={`${e.name}, ${e.sessions} sessions, last ${fmtKg(e.last.kg)} kilos times ${e.last.reps}`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }, pressed && { opacity: 0.6 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.sansSemi }]}>{e.name}</Text>
              <Text style={type.caption}>
                {e.sessions} {e.sessions === 1 ? 'session' : 'sessions'} · last {fmtKg(e.last.kg)} × {e.last.reps}
              </Text>
            </View>
            <Sparkline values={e.spark} />
            <Icon name="chevron" size={16} color={color.inkMuted} strokeWidth={2.2} />
          </Pressable>
        ))}
      </Rows>
    </Card>
  );
}
