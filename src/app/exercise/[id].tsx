import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LineChart } from '../../components/Chart';
import { Badge, BackHeader, Card, EmptyNote, HeroNumber, Rows, Screen, Segmented } from '../../components/ui';
import { useData } from '../../db/useData';
import { exerciseHistory, Session } from '../../db/queries';
import { fmtDate, fmtInt, fmtKg } from '../../lib/format';
import { color, font, radius, type } from '../../theme';

type Metric = 'best' | 'e1rm' | 'volume';
type Range = '1m' | '3m' | 'all';

const DAYS: Record<Range, number> = { '1m': 31, '3m': 92, all: Infinity };
const shortDate = (t: number) => fmtDate(new Date(t)).slice(5);

export default function ExerciseProgress() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const ex = useData(() => exerciseHistory(id), [id]);
  const [metric, setMetric] = useState<Metric>('best');
  const [range, setRange] = useState<Range>('3m');

  const sessions = ex.sessions.filter((s) => (Date.now() - s.startedAt) / 86400000 <= DAYS[range]);
  const shown = sessions.length ? sessions : ex.sessions.slice(-1);
  const valueOf = (s: Session) => (metric === 'best' ? s.best.kg : metric === 'e1rm' ? s.e1rm : s.volume);
  const fmt = (v: number) => (metric === 'volume' ? `${fmtInt(v)} kg` : `${fmtKg(Math.round(v * 2) / 2)} kg`);

  if (!ex.sessions.length) {
    return (
      <Screen bottom={40}>
        <BackHeader label={ex.name} onBack={() => router.back()} />
        <Card rows>
          <EmptyNote>Finish a workout with this exercise and its progress shows up here.</EmptyNote>
        </Card>
      </Screen>
    );
  }

  const first = shown[0];
  const last = shown[shown.length - 1];
  const gain = valueOf(last) - valueOf(first);
  const since = shown.length > 1 ? `${gain >= 0 ? '+' : '−'}${fmt(Math.abs(gain))} since ${shortDate(first.startedAt)}` : 'first session';
  const hero =
    metric === 'best'
      ? { value: fmtKg(last.best.kg), suffix: ' kg', caption: `heaviest set last time, ${last.best.reps} reps · ${since}` }
      : metric === 'e1rm'
        ? { value: fmtKg(Math.round(last.e1rm * 2) / 2), suffix: ' kg', caption: `estimated one-rep max · ${since}` }
        : { value: fmtInt(last.volume), suffix: ' kg', caption: `moved last time, kg × reps · ${since}` };
  const title = metric === 'best' ? 'Heaviest set' : metric === 'e1rm' ? 'Estimated 1RM' : 'Volume per session';

  return (
    <Screen bottom={40}>
      <BackHeader label={ex.name} onBack={() => router.back()} />
      <HeroNumber value={hero.value} suffix={hero.suffix} caption={hero.caption} />
      <Segmented
        options={[
          { id: 'best', label: 'Best set' },
          { id: 'e1rm', label: 'Est. 1RM' },
          { id: 'volume', label: 'Volume' },
        ]}
        value={metric}
        onChange={setMetric}
      />
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={type.lead}>{title}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['1m', '3m', 'all'] as Range[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: r === range }}
                hitSlop={{ top: 6, bottom: 6 }}
                style={{ minWidth: 44, height: 32, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: r === range ? color.paper : 'transparent' }}
              >
                <Text style={[type.caption, { fontFamily: font.sansSemi, color: r === range ? color.ink : color.inkMuted }]}>{r === 'all' ? 'All' : r.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <LineChart
          values={shown.map(valueOf)}
          format={fmt}
          from={shortDate(first.startedAt)}
          to={shortDate(last.startedAt)}
          label={`${title}: ${shown.map((s) => fmt(valueOf(s))).join(', ')}`}
          drawKey={`${metric}-${range}`}
        />
        {!sessions.length ? <Text style={type.caption}>Nothing in this range, so this is your latest session.</Text> : null}
      </Card>
      <Card rows>
        <Text style={[type.label, { paddingTop: 12, paddingBottom: 2 }]}>
          {ex.sessions.length} {ex.sessions.length === 1 ? 'session' : 'sessions'} · reps per set on the right
        </Text>
        <Rows>
          {[...ex.sessions].reverse().map((s) => (
            <Pressable
              key={s.workoutId}
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: String(s.workoutId) } })}
              accessibilityRole="button"
              accessibilityLabel={`${fmtDate(new Date(s.startedAt))}, best ${fmtKg(s.best.kg)} kilos times ${s.best.reps}${s.pr ? ', new best' : ''}. Open workout`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontFamily: font.sansSemi }]}>
                  {fmtKg(s.best.kg)} kg × {s.best.reps}
                </Text>
                <Text style={type.caption}>
                  {fmtDate(new Date(s.startedAt))} · {s.workoutName}
                </Text>
              </View>
              {s.pr ? <Badge label="PR" /> : null}
              <Text style={type.caption}>{s.sets.map((x) => x.reps).join(' · ')}</Text>
            </Pressable>
          ))}
        </Rows>
      </Card>
    </Screen>
  );
}
