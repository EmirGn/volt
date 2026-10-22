import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Line, Text as SvgText } from 'react-native-svg';
import { Dots, DrawLine, EndDot } from '../../components/Chart';
import { Icon } from '../../components/Icon';
import { Badge, Button, Card, Chip, EmptyNote, Header, HeroNumber, Row, Rows, Screen, Segmented, SwipeSegments, useRememberedSegment } from '../../components/ui';
import { useData } from '../../db/useData';
import { exerciseBests, habitsForDay, mainLiftTrend, weightSummary, workoutStats } from '../../db/queries';
import { fmtKg, fmtTonnes } from '../../lib/format';
import { syncNow, useSyncStatus } from '../../sync/sync';
import { color, font, type } from '../../theme';

type Range = 'week' | 'month' | 'year';

export default function Progress() {
  const [range, setRange] = useRememberedSegment<Range>('progress', () => 'month');
  const stats = useData(() => workoutStats(range), [range]);
  const weight = useData(weightSummary);
  const creatine = useData(() => habitsForDay(undefined, 'supplement').find((h) => h.title === 'Creatine'));

  return (
    <Screen>
      <Header label="Progress" icon="edit" accessibilityLabel="Log bodyweight" onPress={() => router.push('/weight')} />
      <HeroNumber value={String(stats.count)} caption={`workouts this ${range}`}>
        {creatine && creatine.streak > 0 ? <Chip label={`Creatine ${creatine.streak} days`} volt /> : null}
        <Chip label={`${fmtTonnes(stats.volume)} lifted`} />
        {weight ? <Chip label={`${fmtKg(weight.latest)} kg`} /> : null}
      </HeroNumber>
      <Segmented
        options={[
          { id: 'week', label: 'Week' },
          { id: 'month', label: 'Month' },
          { id: 'year', label: 'Year' },
        ]}
        value={range}
        onChange={setRange}
      />
      <SwipeSegments ids={['week', 'month', 'year'] as Range[]} value={range} onChange={setRange}>
        <View style={{ gap: 18 }}>
          <TrendCard />
          <WeightCard />
          <RecordsCard />
        </View>
      </SwipeSegments>
      <SyncLine />
    </Screen>
  );
}

function TrendCard() {
  const trend = useData(() => mainLiftTrend(6));
  if (!trend || trend.points.filter((p) => p != null).length < 2) {
    return (
      <Card>
        <Text style={type.lead}>Strength trend</Text>
        <EmptyNote>Two weeks of sessions and your main lift shows up here, week by week.</EmptyNote>
      </Card>
    );
  }
  const vals = trend.points.filter((p): p is number => p != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const xs = trend.points.map((_, i) => 16 + i * 57);
  const y = (v: number) => 110 - ((v - lo) / span) * 80;
  const pts = trend.points.map((p, i) => (p == null ? null : { x: xs[i], y: y(p) })).filter(Boolean) as { x: number; y: number }[];
  const lastPt = pts[pts.length - 1];
  const flatWeeks = (() => {
    let n = 0;
    for (let i = vals.length - 1; i > 0 && vals[i] <= vals[i - 1]; i--) n++;
    return n;
  })();
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Pressable
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(trend.exerciseId) } })}
          accessibilityRole="button"
          accessibilityLabel={`${trend.name}. Show all sessions`}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={type.lead}>{trend.name}</Text>
          <Icon name="chevron" size={14} color={color.inkMuted} strokeWidth={2.2} />
        </Pressable>
        <Text style={type.stat}>{fmtKg(vals[vals.length - 1])} kg</Text>
      </View>
      <Svg width="100%" height={140} viewBox="0 0 318 140" accessibilityLabel={`${trend.name} best set per week: ${vals.map(fmtKg).join(', ')} kg`}>
        <Line x1={0} y1={30} x2={318} y2={30} stroke={color.line} strokeWidth={1.5} />
        <Line x1={0} y1={110} x2={318} y2={110} stroke={color.line} strokeWidth={1.5} />
        <DrawLine pts={pts} />
        <Dots pts={pts.slice(0, -1)} />
        {lastPt ? <EndDot at={lastPt} /> : null}
        {xs.map((x, i) => (
          <SvgText key={i} x={x} y={134} textAnchor="middle" fontSize={12} fontFamily={font.sansMedium} fill={color.inkMuted}>
            {i === xs.length - 1 ? 'Now' : `W-${xs.length - 1 - i}`}
          </SvgText>
        ))}
      </Svg>
      {flatWeeks >= 2 ? <Text style={type.caption}>Flat for {flatWeeks} weeks. A normal plateau, keep the plan for now.</Text> : null}
    </Card>
  );
}

function WeightCard() {
  const w = useData(weightSummary);
  const per = w?.perWeek;
  const verdict =
    per == null
      ? 'Weigh in most mornings to see your weekly trend.'
      : per < 0.2
        ? `${per >= 0 ? '+' : ''}${per.toFixed(1)} kg this week. Under target, add about 300 kcal if it stays flat.`
        : per > 0.6
          ? `+${per.toFixed(1)} kg this week. Faster than planned, that is fine short term.`
          : `+${per.toFixed(1)} kg this week. On track.`;
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={type.lead}>Bodyweight</Text>
        <Text style={type.stat}>{w ? `${fmtKg(w.latest)} kg` : '—'}</Text>
      </View>
      <Text style={type.caption}>{verdict} Goal 75 kg.</Text>
      <Button label="Log weight" variant="paper" height={44} onPress={() => router.push('/weight')} />
    </Card>
  );
}

function RecordsCard() {
  const bests = useData(exerciseBests);
  if (!bests.length) return null;
  return (
    <Card rows>
      <Rows>
        {bests.slice(0, 6).map((b) => (
          <Row
            key={b.exerciseId}
            title={b.name}
            minHeight={54}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(b.exerciseId) } })}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {b.isNew ? <Badge label="New" /> : null}
                <Text style={[type.body, { fontFamily: font.sansSemi }]}>{fmtKg(b.kg)} kg</Text>
              </View>
            }
          />
        ))}
      </Rows>
    </Card>
  );
}

function ago(ms: number) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/** One quiet line about the hub sync. Tapping it syncs now. */
function SyncLine() {
  const s = useSyncStatus();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const label = !s.enabled
    ? 'Sync off'
    : s.syncing && (s.error || !s.lastOk)
      ? 'Syncing…'
      : s.error
        ? 'Couldn’t sync · tap to retry'
        : s.lastOk
          ? `Synced · ${ago(Math.max(0, now - s.lastOk))}`
          : 'Not synced yet';
  return (
    <Pressable
      onPress={s.enabled ? () => void syncNow().then(() => setNow(Date.now())) : undefined}
      disabled={!s.enabled}
      accessibilityRole={s.enabled ? 'button' : 'text'}
      accessibilityLabel={s.enabled ? `${label}. Sync now` : label}
      hitSlop={8}
      style={({ pressed }) => ({ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={[type.caption, { textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}
