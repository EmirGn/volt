// Rows shared by Train's History card and the full history screen.
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HistoryRow, startOfWeek } from '../db/queries';
import { fmtTonnes, shortDay } from '../lib/format';
import { color, font, type } from '../theme';
import { Icon } from './Icon';
import { Badge } from './ui';

export function WorkoutRow({ w, pr }: { w: HistoryRow; pr: boolean }) {
  const d = new Date(w.startedAt);
  const min = Math.max(1, Math.round((w.finishedAt - w.startedAt) / 60000));
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/history/[id]', params: { id: String(w.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${w.name}, ${d.toDateString()}, ${min} minutes, ${w.sets} sets${pr ? ', new best' : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }, pressed && { opacity: 0.6 }]}
    >
      <View style={{ width: 44, alignItems: 'center' }}>
        <Text style={type.label}>{shortDay(d)}</Text>
        <Text style={[type.stat, { fontSize: 20 }]}>{d.getDate()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontFamily: font.sansSemi }]}>{w.name}</Text>
        <Text style={type.caption}>
          {min} min · {w.sets} sets · {fmtTonnes(w.volume)} lifted
        </Text>
      </View>
      {pr ? <Badge label="PR" /> : null}
      <Icon name="chevron" size={16} color={color.inkMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Groups newest-first workouts by week: "This week", "Last week", "Week of 5 Oct". */
export function byWeek(rows: HistoryRow[]) {
  const thisWeek = startOfWeek().getTime();
  const groups: { label: string; rows: HistoryRow[] }[] = [];
  let key = -1;
  for (const r of rows) {
    const k = startOfWeek(new Date(r.startedAt)).getTime();
    if (k !== key) {
      key = k;
      const ago = Math.round((thisWeek - k) / (7 * 86400000));
      const d = new Date(k);
      groups.push({ label: ago === 0 ? 'This week' : ago === 1 ? 'Last week' : `Week of ${d.getDate()} ${MONTHS[d.getMonth()]}`, rows: [] });
    }
    groups[groups.length - 1].rows.push(r);
  }
  return groups;
}
