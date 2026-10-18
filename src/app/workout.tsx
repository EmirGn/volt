import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Icon } from '../components/Icon';
import { Button, Card, RoundButton, Stepper, Tick } from '../components/ui';
import { useData } from '../db/useData';
import {
  deleteSet,
  finishWorkout,
  getPlanItems,
  getTargets,
  getWorkout,
  lastPerformance,
  logSet,
  PlanItem,
  progression,
  workoutSets,
} from '../db/queries';
import { fmtClock, fmtKg } from '../lib/format';
import { color, font, radius, size, space, type } from '../theme';

type Entry = { exerciseId: number; kg: number; reps: number };
type Rest = { endsAt: number; total: number };

export default function WorkoutScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(idParam);
  const insets = useSafeAreaInsets();
  const workout = useData(() => getWorkout(workoutId), [workoutId]);
  const items = useData(() => (workout?.routineId ? getPlanItems(workout.routineId) : []), [workout?.routineId]);
  const sets = useData(() => workoutSets(workoutId), [workoutId]);
  const { kgStep } = useData(getTargets);

  const doneCount = (exId: number) => sets.filter((s) => s.exerciseId === exId).length;
  const firstOpen = () => {
    const i = items.findIndex((it) => doneCount(it.exerciseId) < it.sets);
    return i === -1 ? Math.max(0, items.length - 1) : i;
  };

  const [idx, setIdx] = useState<number | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(Date.now());

  const current = idx ?? firstOpen();
  const item: PlanItem | undefined = items[current];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rest && now >= rest.endsAt) {
      setRest(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [now, rest]);

  const last = useMemo(() => (item ? lastPerformance(item.exerciseId, workoutId) : []), [item, workoutId]);
  const prog = item ? progression(item, last, kgStep) : null;
  const mine = item ? sets.filter((s) => s.exerciseId === item.exerciseId) : [];
  const setNo = mine.length + 1;

  // What the steppers start at: this session's last set, else last time (+1 step if earned), else a sane start.
  const defaults = (): Entry | null => {
    if (!item) return null;
    if (mine.length) {
      const s = mine[mine.length - 1];
      return { exerciseId: item.exerciseId, kg: s.kg, reps: s.reps };
    }
    if (last.length) {
      return prog?.ready
        ? { exerciseId: item.exerciseId, kg: prog.nextKg, reps: item.repMin }
        : { exerciseId: item.exerciseId, kg: last[0].kg, reps: last[0].reps };
    }
    return { exerciseId: item.exerciseId, kg: 20, reps: item.repMin };
  };
  const value = entry && item && entry.exerciseId === item.exerciseId ? entry : defaults();

  if (!workout || !item || !value) {
    return (
      <View style={{ flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Text style={type.body}>This workout is no longer open.</Text>
        <Button label="Back" variant="surface" onPress={() => router.back()} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  const targetDone = mine.length >= item.sets;
  const nextOpenIdx = items.findIndex((it, i) => i !== current && doneCount(it.exerciseId) < it.sets);
  const allDone = targetDone && nextOpenIdx === -1;
  const lastSame = last[mine.length] ?? last[last.length - 1];
  const upNext = nextOpenIdx >= 0 ? items[nextOpenIdx] : null;
  const partner = item.superset != null ? items.find((it, i) => i !== current && it.superset === item.superset) : null;

  const adjust = (dkg: number, dreps: number) =>
    setEntry({
      exerciseId: item.exerciseId,
      kg: Math.max(0, Math.round((value.kg + dkg) * 100) / 100),
      reps: Math.max(1, value.reps + dreps),
    });

  const complete = () => {
    if (allDone) return finish();
    if (targetDone) {
      setIdx(nextOpenIdx);
      setEntry(null);
      return;
    }
    logSet(workout.id, item.exerciseId, value.kg, value.reps);
    const doneAfter = mine.length + 1;
    // Supersets: hop to the partner without resting, rest after the pair.
    if (partner) {
      const pIdx = items.indexOf(partner);
      const pDone = doneCount(partner.exerciseId);
      if (pDone < partner.sets && pDone < doneAfter) {
        setIdx(pIdx);
        setRest(null);
        return;
      }
      if (doneAfter < item.sets || pDone < partner.sets) {
        const firstOfPair = Math.min(current, pIdx);
        setIdx(firstOfPair);
      }
    }
    setRest({ endsAt: Date.now() + item.restSec * 1000, total: item.restSec });
  };

  const finish = () => {
    const doIt = () => {
      finishWorkout(workout.id);
      router.back();
    };
    if (allDone || sets.length === 0) return doIt();
    Alert.alert('Finish workout?', `${sets.length} sets logged. Unfinished exercises are skipped.`, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Finish', onPress: doIt },
    ]);
  };

  const removeSet = (setId: number, n: number) =>
    Alert.alert(`Delete set ${n}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSet(setId) },
    ]);

  const hint = prog
    ? prog.ready
      ? `You hit ${item.repMax} on every set last time. ${fmtKg(prog.nextKg)} kg today.`
      : `Hit ${item.repMax} on all ${item.sets} sets and next time is ${fmtKg(prog.nextKg)} kg.`
    : item.tip ?? '';
  const restLeft = rest ? rest.endsAt - now : 0;
  const ctaLabel = allDone ? 'Finish workout' : targetDone ? `Next: ${upNext?.name ?? ''}` : `Complete set ${setNo}`;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <RoundButton icon="back" strokeWidth={2.4} accessibilityLabel="Back, keep workout running" onPress={() => router.back()} />
          <Text style={type.pageLabel}>
            {workout.name} · {fmtClock(now - workout.startedAt)}
          </Text>
          <Button label="Finish" variant="surface" height={44} style={{ paddingHorizontal: 16 }} onPress={finish} />
        </View>
        <View style={{ flexDirection: 'row', gap: 5 }} accessibilityLabel={`Exercise ${current + 1} of ${items.length}`}>
          {items.map((it, i) => (
            <Pressable
              key={it.id}
              onPress={() => {
                setIdx(i);
                setEntry(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${it.name}`}
              hitSlop={{ top: 12, bottom: 12 }}
              style={{ flex: 1, height: 5, borderRadius: 5, backgroundColor: i <= current || doneCount(it.exerciseId) >= it.sets ? color.ink : color.track }}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.stack, gap: space.stack }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={type.lead}>{item.name}</Text>
          <Text style={[type.caption, { fontSize: 14, textAlign: 'center' }]}>
            {targetDone ? 'Target done' : `Set ${setNo}`} · target {item.sets} × {item.repMin}–{item.repMax}
            {lastSame ? ` · last time ${fmtKg(lastSame.kg)} kg × ${lastSame.reps}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <Text style={type.hero} numberOfLines={1} adjustsFontSizeToFit>
              {fmtKg(value.kg)}
            </Text>
            <Text style={{ fontFamily: font.displayBold, fontSize: 28, color: color.inkMuted }}>kg × {value.reps}</Text>
          </View>
          {rest && restLeft > 0 ? (
            <Pressable
              onPress={() => setRest(null)}
              accessibilityRole="button"
              accessibilityLabel={`Resting, ${fmtClock(restLeft)} left. Skip rest`}
              style={{ marginTop: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: color.volt, justifyContent: 'center' }}
            >
              <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>Rest {fmtClock(restLeft)} · Skip</Text>
            </Pressable>
          ) : null}
          {partner ? <Text style={type.caption}>Superset with {partner.name}</Text> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stepper label="Weight" onMinus={() => adjust(-kgStep, 0)} onPlus={() => adjust(kgStep, 0)} />
          <Stepper label="Reps" onMinus={() => adjust(0, -1)} onPlus={() => adjust(0, 1)} />
        </View>

        <Card style={{ paddingVertical: 8 }}>
          {mine.map((s, i) => (
            <Pressable
              key={s.id}
              onLongPress={() => removeSet(s.id, i + 1)}
              accessibilityHint="Long press to delete"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: 1, borderBottomColor: color.line }}
            >
              <Tick done />
              <Text style={[type.body, { flex: 1 }]}>Set {i + 1}</Text>
              <Text style={[type.body, { fontFamily: font.sansSemi }]}>
                {fmtKg(s.kg)} kg × {s.reps}
              </Text>
            </Pressable>
          ))}
          {hint ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8 }}>
              <Icon name="bulb" size={18} color={color.inkMuted} />
              <Text style={[type.caption, { flex: 1 }]}>{hint}</Text>
            </View>
          ) : null}
        </Card>

        {upNext && !targetDone ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
            <Text style={type.caption}>Up next</Text>
            <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>
              {upNext.name} · {upNext.sets} × {upNext.repMin}–{upNext.repMax}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: Math.max(26, insets.bottom) }}>
        <Button label={ctaLabel} trailing={targetDone && !allDone ? 'arrow' : 'check'} height={size.ctaH} onPress={complete} />
      </View>
    </View>
  );
}
