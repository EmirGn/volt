import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../../components/Icon';
import { Badge, BackHeader, Card, Chip, EmptyNote, HeroNumber, Rows, Screen } from '../../components/ui';
import { useData } from '../../db/useData';
import { WorkoutExercise, workoutDetail } from '../../db/queries';
import { fmtDate, fmtKg, fmtTonnes } from '../../lib/format';
import { color, font, radius, type } from '../../theme';

/** "+2.5 kg", "+2 reps", "same as last", compared with this exercise's previous session. */
function delta(x: WorkoutExercise): { text: string; up: boolean } {
  if (!x.before) return { text: 'first time', up: false };
  const top = x.sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
  const dk = Math.round((top.kg - x.before.best.kg) * 100) / 100;
  if (dk > 0) return { text: `+${fmtKg(dk)} kg`, up: true };
  if (dk < 0) return { text: `${fmtKg(dk)} kg`, up: false };
  const reps = x.sets.reduce((n, s) => n + s.reps, 0) - x.before.sets.reduce((n, s) => n + s.reps, 0);
  if (reps > 0) return { text: `+${reps} ${reps === 1 ? 'rep' : 'reps'}`, up: true };
  if (reps < 0) return { text: `${reps} ${reps === -1 ? 'rep' : 'reps'}`, up: false };
  return { text: 'same as last', up: false };
}

export default function WorkoutHistory() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const w = useData(() => workoutDetail(id), [id]);

  if (!w) {
    return (
      <Screen bottom={40}>
        <BackHeader label="Workout" onBack={() => router.back()} />
        <Card rows>
          <EmptyNote>This workout was deleted.</EmptyNote>
        </Card>
      </Screen>
    );
  }

  const min = Math.max(1, Math.round(((w.finishedAt ?? Date.now()) - w.startedAt) / 60000));
  const prs = w.exercises.filter((x) => x.pr).length;
  const tonnes = w.volume >= 1000;
  const dv = w.previousVolume != null ? w.volume - w.previousVolume : null;

  return (
    <Screen bottom={40}>
      <BackHeader label={fmtDate(new Date(w.startedAt))} onBack={() => router.back()} />
      <HeroNumber
        value={tonnes ? (w.volume / 1000).toFixed(1).replace(/\.0$/, '') : fmtKg(Math.round(w.volume))}
        suffix={tonnes ? ' t' : ' kg'}
        caption={`lifted · ${w.name} · ${min} min · ${w.sets} sets`}
      >
        <Chip label={dv == null ? `First ${w.name}` : `${dv >= 0 ? '+' : '−'}${fmtTonnes(Math.abs(dv))} vs last ${w.name}`} />
        {prs ? <Chip label={`${prs} new ${prs === 1 ? 'best' : 'bests'}`} volt /> : null}
      </HeroNumber>
      <Card rows>
        <Rows>
          {w.exercises.map((x) => {
            const d = delta(x);
            return (
              <Pressable
                key={x.exerciseId}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(x.exerciseId) } })}
                accessibilityRole="button"
                accessibilityLabel={`${x.name}, ${x.sets.length} sets, ${d.text}${x.pr ? ', new best' : ''}. Show progress`}
                style={({ pressed }) => [{ paddingVertical: 14, gap: 10 }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[type.body, { flex: 1, fontFamily: font.sansSemi }]}>{x.name}</Text>
                  {x.pr ? <Badge label="PR" /> : null}
                  <Text style={[type.caption, { fontFamily: font.sansSemi, color: d.up ? color.ink : color.inkMuted }]}>{d.text}</Text>
                  <Icon name="chevron" size={14} color={color.inkMuted} strokeWidth={2.2} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {x.sets.map((s, i) => (
                    <View key={i} style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.paper }}>
                      <Text style={[type.caption, { color: color.ink, fontFamily: font.sansSemi }]}>
                        {fmtKg(s.kg)} × {s.reps}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </Rows>
        <Text style={[type.caption, { paddingVertical: 12 }]}>Compared with the last time you did each exercise. Tap one for its graph.</Text>
      </Card>
    </Screen>
  );
}
