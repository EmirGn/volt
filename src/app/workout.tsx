import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ErrorBoundaryProps, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { ErrorScreen } from '../components/ErrorScreen';
import { ConfirmSheet, DoneSheet, useFeedback } from '../components/feedback';
import { Icon } from '../components/Icon';
import { Button, Card, RoundButton, Stepper } from '../components/ui';
import { useData } from '../db/useData';
import {
  bestKg,
  deleteSet,
  finishWorkout,
  getPlanItems,
  getTargets,
  getWorkout,
  lastPerformance,
  logSet,
  PlanItem,
  progression,
  updateSet,
  workoutSets,
  workoutSummary,
} from '../db/queries';
import { fmtClock, fmtKg, fmtTonnes } from '../lib/format';
import { cancelRestEnd, COUNTDOWN_MS, scheduleRestEnd, setWorkoutOpen } from '../lib/notifications';
import { playCountdown, stopCountdown } from '../lib/sound';
import { color, font, radius, size, space, type } from '../theme';

type Entry = { exerciseId: number; kg: number; reps: number };
type Rest = { endsAt: number; total: number };
type Editing = { setId: number; n: number };

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} label="Workout" />;
}

const names = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const parseNum = (s: string) => Number(s.replace(',', '.'));

export default function WorkoutScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(idParam);
  const insets = useSafeAreaInsets();
  const { toast, sheet, replaceSheet } = useFeedback();
  const workout = useData(() => getWorkout(workoutId), [workoutId]);
  const items = useData(() => (workout?.routineId ? getPlanItems(workout.routineId) : []), [workout?.routineId]);
  const sets = useData(() => workoutSets(workoutId), [workoutId]);
  const { kgStep } = useData(getTargets);

  // The phone stays lit for the whole session, so the timer and the weight read from the bench.
  useKeepAwake('workout');

  const doneCount = (exId: number) => sets.filter((s) => s.exerciseId === exId).length;
  const firstOpen = () => {
    const i = items.findIndex((it) => doneCount(it.exerciseId) < it.sets);
    return i === -1 ? Math.max(0, items.length - 1) : i;
  };

  // Where you are only changes when you move. Logging a set never jumps to another exercise.
  const [idx, setIdx] = useState<number | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [typing, setTyping] = useState<{ field: 'kg' | 'reps'; text: string } | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(Date.now());
  const counted = useRef<number | null>(null);

  const current = Math.min(idx ?? firstOpen(), Math.max(0, items.length - 1));
  const item: PlanItem | undefined = items[current];

  useEffect(() => {
    setWorkoutOpen(true);
    return () => {
      setWorkoutOpen(false);
      stopCountdown();
    };
  }, []);

  // A quarter-second tick while resting, so the countdown starts on time.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), rest ? 250 : 1000);
    return () => clearInterval(t);
  }, [rest]);

  useEffect(() => {
    if (!rest) return;
    const left = rest.endsAt - now;
    // The sound is bip, bip, bip, then the long beep 3 s in. Start it only if we're on time for it.
    if (left <= COUNTDOWN_MS && left > COUNTDOWN_MS - 800 && counted.current !== rest.endsAt) {
      counted.current = rest.endsAt;
      playCountdown();
    }
    if (left <= 0) {
      setRest(null);
      cancelRestEnd();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (item) {
        const n = sets.filter((s) => s.exerciseId === item.exerciseId).length;
        toast({ kind: 'info', title: 'Rest done', detail: n < item.sets ? `Next: ${item.name.toLowerCase()}, set ${n + 1}` : `Next: ${item.name.toLowerCase()}` });
      }
    }
    // Only the clock and the rest decide when this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const isLast = current === items.length - 1;
  const nextItem = isLast ? null : items[current + 1];
  const lastSame = last[mine.length] ?? last[last.length - 1];
  const partner = item.superset != null ? items.find((it, i) => i !== current && it.superset === item.superset) : null;

  const go = (i: number) => {
    if (i < 0 || i >= items.length) return;
    setIdx(i);
    setEntry(null);
    setEditing(null);
    setTyping(null);
  };

  const endRest = () => {
    setRest(null);
    cancelRestEnd();
    stopCountdown();
  };

  // Functional so a held + keeps counting from the latest value.
  const adjust = (dkg: number, dreps: number) =>
    setEntry((prev) => {
      const base = prev && prev.exerciseId === item.exerciseId ? prev : value;
      return {
        exerciseId: item.exerciseId,
        kg: Math.max(0, Math.round((base.kg + dkg) * 100) / 100),
        reps: Math.max(1, base.reps + dreps),
      };
    });

  const commitTyping = () => {
    if (!typing) return;
    const n = parseNum(typing.text);
    if (Number.isFinite(n) && n >= 0 && typing.text.trim() !== '') {
      setEntry({
        exerciseId: item.exerciseId,
        kg: typing.field === 'kg' ? Math.round(n * 100) / 100 : value.kg,
        reps: typing.field === 'reps' ? Math.max(1, Math.round(n)) : value.reps,
      });
    }
    setTyping(null);
  };

  const startEdit = (setId: number, n: number, kg: number, reps: number) => {
    if (editing?.setId === setId) {
      setEditing(null);
      setEntry(null);
      return;
    }
    setEditing({ setId, n });
    setEntry({ exerciseId: item.exerciseId, kg, reps });
  };

  const saveEdit = () => {
    if (!editing) return;
    const undo = updateSet(editing.setId, value.kg, value.reps);
    toast({ title: `Set ${editing.n} updated`, detail: `${fmtKg(value.kg)} kg × ${value.reps}`, action: { label: 'Undo', onPress: undo } });
    setEditing(null);
    setEntry(null);
  };

  const log = () => {
    if (editing) return saveEdit();
    // Pin the current exercise, so the next set lands here even once the target is done.
    setIdx(current);
    const before = bestKg(item.exerciseId);
    const setId = logSet(workout.id, item.exerciseId, value.kg, value.reps);
    const doneAfter = mine.length + 1;
    toast({
      title: `Set ${setNo} logged`,
      detail: `${fmtKg(value.kg)} kg × ${value.reps}${doneAfter > item.sets ? ' · extra set' : ''}${before != null && value.kg > before ? ' · new best' : ''}`,
      action: {
        label: 'Undo',
        onPress: () => {
          deleteSet(setId);
          endRest();
        },
      },
    });
    // Supersets: hop to the partner without resting, rest after the pair.
    if (partner) {
      const pIdx = items.indexOf(partner);
      const pDone = doneCount(partner.exerciseId);
      if (pDone < partner.sets && pDone < doneAfter) {
        go(pIdx);
        endRest();
        return;
      }
      if (doneAfter < item.sets || pDone < partner.sets) go(Math.min(current, pIdx));
    }
    setRest({ endsAt: Date.now() + item.restSec * 1000, total: item.restSec });
    counted.current = null;
    const nextUp =
      doneAfter < item.sets
        ? `Set ${doneAfter + 1} of ${item.name.toLowerCase()} · ${fmtKg(value.kg)} kg × ${value.reps}`
        : nextItem
          ? `Next: ${nextItem.name.toLowerCase()}`
          : 'That was the last set. Finish when you are ready.';
    scheduleRestEnd(item.restSec, nextUp).catch(() => {});
  };

  const finish = () => {
    const summary = workoutSummary(workout.id);
    if (!summary || summary.sets === 0) {
      finishWorkout(workout.id);
      endRest();
      router.back();
      toast({ kind: 'info', title: 'Workout discarded', detail: 'No sets were logged' });
      return;
    }
    const saved = () => {
      finishWorkout(workout.id);
      endRest();
      const s = workoutSummary(workout.id) ?? summary;
      return (close: () => void) => (
        <DoneSheet
          title="Workout saved"
          body={`${Math.max(1, Math.round(s.ms / 60000))} min · ${s.sets} ${s.sets === 1 ? 'set' : 'sets'} · ${fmtTonnes(s.volume)} lifted.`}
          record={s.best ? { name: s.best.name, value: `${fmtKg(s.best.kg)} kg × ${s.best.reps}`, was: `${fmtKg(s.best.prevKg)} kg` } : undefined}
          actionLabel="Back to Today"
          close={close}
        />
      );
    };
    const allDone = items.every((it) => doneCount(it.exerciseId) >= it.sets);
    if (allDone) return sheet(saved(), { onClose: () => router.back() });

    const body = summary.planned
      ? `You've done ${summary.completed} of ${summary.planned} exercises.` +
        (summary.skipped.length > 2
          ? ` The other ${summary.skipped.length} will be saved as skipped.`
          : summary.skipped.length
            ? ` ${names(summary.skipped)} will be saved as skipped.`
            : ' Unfinished sets are skipped.')
      : `${summary.sets} sets logged.`;
    sheet((close) => (
      <ConfirmSheet
        icon="flag"
        title="Finish workout?"
        body={body}
        stats={[
          { value: fmtClock(summary.ms), label: 'time' },
          { value: String(summary.sets), label: summary.sets === 1 ? 'set' : 'sets' },
          { value: fmtTonnes(summary.volume), label: 'lifted' },
        ]}
        confirmLabel="Finish workout"
        cancelLabel="Keep going"
        onConfirm={() => replaceSheet(saved(), { onClose: () => router.back() })}
        close={close}
      />
    ));
  };

  const removeSet = (setId: number, n: number) => {
    if (editing?.setId === setId) setEditing(null);
    const undo = deleteSet(setId);
    toast({ title: `Set ${n} deleted`, action: { label: 'Undo', onPress: undo } });
  };

  const openList = () =>
    sheet((close) => (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 }}>
          <Text style={type.title}>{workout.name}</Text>
          <Text style={type.caption}>
            {items.filter((it) => doneCount(it.exerciseId) >= it.sets).length} of {items.length} done
          </Text>
        </View>
        {items.map((it, i) => {
          const d = doneCount(it.exerciseId);
          const full = d >= it.sets;
          return (
            <Pressable
              key={it.id}
              onPress={() => {
                go(i);
                close();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${it.name}, ${d} of ${it.sets} sets`}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14, borderRadius: radius.inset },
                i === current && { backgroundColor: color.paper },
                pressed && { opacity: 0.6 },
              ]}
            >
              {full ? (
                <View style={{ width: 26, height: 26, borderRadius: 26, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={14} strokeWidth={3} color={color.inkInverse} />
                </View>
              ) : (
                <View style={{ width: 26, height: 26, borderRadius: 26, borderWidth: 2, borderColor: d ? color.ink : color.lineStrong }} />
              )}
              <Text style={[type.body, { flex: 1, fontFamily: font.sansSemi }]}>{it.name}</Text>
              <Text style={type.caption}>{d ? `${d} / ${it.sets} sets` : `${it.sets} × ${it.repMin}–${it.repMax}`}</Text>
            </Pressable>
          );
        })}
      </View>
    ));

  const hint = prog
    ? prog.ready
      ? `You hit ${item.repMax} on every set last time. ${fmtKg(prog.nextKg)} kg today.`
      : `Hit ${item.repMax} on all ${item.sets} sets and next time is ${fmtKg(prog.nextKg)} kg.`
    : item.tip ?? '';
  const restLeft = rest ? rest.endsAt - now : 0;
  const finalSeconds = rest != null && restLeft <= COUNTDOWN_MS;
  const caption = targetDone
    ? `Target done · ${mine.length} sets · more is fine`
    : `Set ${setNo} of ${item.sets} · target ${item.repMin}–${item.repMax}${lastSame ? ` · last ${fmtKg(lastSame.kg)} × ${lastSame.reps}` : ''}`;
  const logLabel = editing ? `Update set ${editing.n}` : `Log set ${setNo}${targetDone ? ' · extra' : ''}`;
  const planned = Math.max(item.sets, mine.length);

  const numberStyle = { fontFamily: font.displayBold, fontSize: 28, color: color.inkMuted };

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <RoundButton icon="back" strokeWidth={2.4} accessibilityLabel="Back, keep workout running" onPress={() => router.back()} />
          <Text style={type.pageLabel}>
            {workout.name} · {fmtClock(now - workout.startedAt)}
          </Text>
          <Button label="Finish" variant="surface" height={44} style={{ paddingHorizontal: 16 }} onPress={finish} />
        </View>
        {/* Each bar is a full 44pt tap target; the visible bar is just the middle of it. */}
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {items.map((it, i) => {
            const d = doneCount(it.exerciseId);
            const full = d >= it.sets;
            const here = i === current;
            return (
              <Pressable
                key={it.id}
                onPress={() => go(i)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${it.name}`}
                accessibilityState={{ selected: here }}
                style={{ flex: 1, height: size.touchMin, justifyContent: 'center' }}
              >
                <View
                  style={{
                    height: here ? 8 : 5,
                    borderRadius: 6,
                    backgroundColor: here ? (full ? color.ink : 'transparent') : full ? color.ink : d ? color.lineStrong : color.track,
                    borderWidth: here ? 2 : 0,
                    borderColor: color.ink,
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.gutter, paddingTop: 4, gap: space.stack }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RoundButton
            icon="back"
            strokeWidth={2.4}
            accessibilityLabel="Previous exercise"
            onPress={() => go(current - 1)}
            style={current === 0 && { opacity: 0.35 }}
          />
          <Pressable
            onPress={openList}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, exercise ${current + 1} of ${items.length}. Show all exercises`}
            style={({ pressed }) => [{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 }, pressed && { opacity: 0.6 }]}
          >
            <Text style={[type.lead, { fontSize: 17 }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={type.caption}>
                Exercise {current + 1} of {items.length} · all
              </Text>
              <View style={{ transform: [{ rotate: '90deg' }] }}>
                <Icon name="chevron" size={12} strokeWidth={2.6} color={color.inkMuted} />
              </View>
            </View>
          </Pressable>
          <RoundButton
            icon="chevron"
            strokeWidth={2.4}
            accessibilityLabel="Next exercise"
            onPress={() => go(current + 1)}
            style={isLast && { opacity: 0.35 }}
          />
        </View>

        <View style={{ alignItems: 'center', gap: 6, marginTop: -6 }}>
          <Text style={[type.caption, { fontSize: 14, textAlign: 'center' }]}>{caption}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            {typing?.field === 'kg' ? (
              <TextInput
                value={typing.text}
                onChangeText={(text) => setTyping({ field: 'kg', text })}
                onBlur={commitTyping}
                onSubmitEditing={commitTyping}
                autoFocus
                selectTextOnFocus
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel="Weight in kilos"
                style={[type.hero, { minWidth: 120, textAlign: 'center', padding: 0 }]}
              />
            ) : (
              <Pressable onPress={() => setTyping({ field: 'kg', text: fmtKg(value.kg) })} accessibilityRole="button" accessibilityLabel={`${fmtKg(value.kg)} kilos. Type the weight`}>
                <Text style={type.hero} numberOfLines={1} adjustsFontSizeToFit>
                  {fmtKg(value.kg)}
                </Text>
              </Pressable>
            )}
            <Text style={numberStyle}>kg ×</Text>
            {typing?.field === 'reps' ? (
              <TextInput
                value={typing.text}
                onChangeText={(text) => setTyping({ field: 'reps', text })}
                onBlur={commitTyping}
                onSubmitEditing={commitTyping}
                autoFocus
                selectTextOnFocus
                keyboardType="number-pad"
                returnKeyType="done"
                accessibilityLabel="Reps"
                style={[numberStyle, { minWidth: 36, padding: 0, color: color.ink }]}
              />
            ) : (
              <Pressable onPress={() => setTyping({ field: 'reps', text: String(value.reps) })} accessibilityRole="button" accessibilityLabel={`${value.reps} reps. Type the reps`} hitSlop={12}>
                <Text style={numberStyle}>{value.reps}</Text>
              </Pressable>
            )}
          </View>
          {rest && restLeft > 0 ? (
            <Pressable
              onPress={endRest}
              accessibilityRole="button"
              accessibilityLabel={`Resting, ${fmtClock(restLeft + 999)} left. Skip rest`}
              style={{
                marginTop: 6,
                minHeight: 40,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: finalSeconds ? color.ink : color.volt,
                justifyContent: 'center',
              }}
            >
              <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14, color: finalSeconds ? color.inkInverse : color.ink }]}>
                Rest {fmtClock(restLeft + 999)} · Skip
              </Text>
            </Pressable>
          ) : null}
          {partner ? <Text style={type.caption}>Superset with {partner.name}</Text> : null}
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stepper label="Weight" onMinus={() => adjust(-kgStep, 0)} onPlus={() => adjust(kgStep, 0)} />
            <Stepper label="Reps" onMinus={() => adjust(0, -1)} onPlus={() => adjust(0, 1)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {editing ? (
              <Button
                label="Cancel"
                variant="surface"
                onPress={() => {
                  setEditing(null);
                  setEntry(null);
                }}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button label={logLabel} variant="volt" trailing="check" height={56} onPress={log} style={{ flex: 2 }} />
          </View>
        </View>

        <Card style={{ paddingVertical: 6 }}>
          {Array.from({ length: planned }, (_, i) => {
            const s = mine[i];
            if (!s) {
              const ref = last[i] ?? last[last.length - 1];
              return (
                <View key={`plan-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: color.line }}>
                  <View style={{ width: 24, height: 24, borderRadius: 24, borderWidth: 2, borderColor: color.lineStrong }} />
                  <Text style={[type.body, { flex: 1, color: color.inkMuted }]}>Set {i + 1}</Text>
                  {ref ? (
                    <Text style={type.caption}>
                      last time {fmtKg(ref.kg)} × {ref.reps}
                    </Text>
                  ) : null}
                </View>
              );
            }
            const selected = editing?.setId === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => startEdit(s.id, i + 1, s.kg, s.reps)}
                onLongPress={() => removeSet(s.id, i + 1)}
                accessibilityRole="button"
                accessibilityLabel={`Set ${i + 1}, ${fmtKg(s.kg)} kilos times ${s.reps}`}
                accessibilityHint="Tap to change it, long press to delete"
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: color.line },
                  selected && { backgroundColor: color.paper, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: radius.inset, borderBottomWidth: 0 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                {/* Ink, not volt: the Log set button and the rest pill already use this screen's two volt moments. */}
                <View style={{ width: 24, height: 24, borderRadius: 24, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={13} strokeWidth={3} color={color.inkInverse} />
                </View>
                <Text style={[type.body, { flex: 1 }]}>
                  Set {i + 1}
                  {i >= item.sets ? <Text style={type.caption}> extra</Text> : null}
                </Text>
                <Text style={[type.body, { fontFamily: font.sansSemi }]}>
                  {selected ? 'Editing · ' : ''}
                  {fmtKg(s.kg)} kg × {s.reps}
                </Text>
              </Pressable>
            );
          })}
          {hint ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8 }}>
              <Icon name="bulb" size={18} color={color.inkMuted} />
              <Text style={[type.caption, { flex: 1 }]}>{hint}</Text>
            </View>
          ) : null}
        </Card>
        {mine.length ? <Text style={[type.caption, { textAlign: 'center' }]}>Tap a set to fix it, hold to delete.</Text> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: Math.max(26, insets.bottom) }}>
        <Button
          label={nextItem ? `Next: ${nextItem.name}` : 'Finish workout'}
          trailing={nextItem ? 'arrow' : 'check'}
          height={size.ctaH}
          onPress={nextItem ? () => go(current + 1) : finish}
        />
      </View>
    </View>
  );
}
