import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Badge, Button, Card, Chip, EmptyNote, Header, HeroNumber, Row, Rows, Screen, Segmented } from '../../components/ui';
import { useData } from '../../db/useData';
import { exerciseBests, habitsForDay, mainLiftTrend, weightSummary, workoutStats } from '../../db/queries';
import { fmtKg, fmtTonnes } from '../../lib/format';
import { color, font, type } from '../../theme';

type Range = 'week' | 'month' | 'year';

export default function Progress() {
  const [range, setRange] = useState<Range>('month');
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
      <TrendCard />
      <WeightCard />
      <RecordsCard />
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
        <Text style={type.lead}>{trend.name}</Text>
        <Text style={type.stat}>{fmtKg(vals[vals.length - 1])} kg</Text>
      </View>
      <Svg width="100%" height={140} viewBox="0 0 318 140" accessibilityLabel={`${trend.name} best set per week: ${vals.map(fmtKg).join(', ')} kg`}>
        <Line x1={0} y1={30} x2={318} y2={30} stroke={color.line} strokeWidth={1.5} />
        <Line x1={0} y1={110} x2={318} y2={110} stroke={color.line} strokeWidth={1.5} />
        {pts.length > 1 ? (
          <Polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={color.ink}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {pts.slice(0, -1).map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={5} fill={color.ink} />
        ))}
        {lastPt ? <Circle cx={lastPt.x} cy={lastPt.y} r={9} fill={color.volt} stroke={color.ink} strokeWidth={3} /> : null}
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
