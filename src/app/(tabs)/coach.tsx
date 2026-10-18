import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfflineBanner } from '../../components/feedback';
import { Icon } from '../../components/Icon';
import { Card, Header, Rows, Screen, Segmented, Tick } from '../../components/ui';
import { useData } from '../../db/useData';
import { getRoutines, isoWeekday, planWeek, weekWorkouts, WEEKDAY_SHORT } from '../../db/queries';
import { color, font, radius, space, type } from '../../theme';

type Tab = 'chat' | 'plan';

export default function Coach() {
  const [tab, setTab] = useState<Tab>('chat');
  const insets = useSafeAreaInsets();
  const routines = useData(getRoutines);
  const weekNo = useData(planWeek);
  const days = routines.filter((r) => r.weekday != null).length;

  return (
    <View style={{ flex: 1 }}>
      <Screen bottom={tab === 'chat' ? 184 : space.dockClear}>
        <Header label="Coach" />
        <OfflineBanner />
        <View style={{ alignItems: 'center', gap: 4, paddingVertical: 4 }}>
          <Text style={[type.title, { fontSize: 44, lineHeight: 48, letterSpacing: -1.8, textAlign: 'center' }]}>Upper / Lower</Text>
          <Text style={[type.lead, { fontFamily: font.sans, color: color.inkMuted }]}>
            {days} days a week · week {weekNo} of your plan
          </Text>
        </View>
        <Segmented
          options={[
            { id: 'chat', label: 'Chat' },
            { id: 'plan', label: 'This week' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'chat' ? <Chat /> : <ThisWeek />}
      </Screen>
      {tab === 'chat' ? (
        <View
          style={{
            position: 'absolute',
            left: space.gutter,
            right: space.gutter,
            bottom: Math.max(26, insets.bottom) + 78,
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 54,
            paddingLeft: 20,
            paddingRight: 6,
            borderRadius: radius.pill,
            backgroundColor: color.surface,
            borderWidth: 1.5,
            borderColor: '#E3E3DD',
          }}
        >
          <TextInput
            editable={false}
            placeholder="Coach is offline in this build"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel="Message Coach, not available yet"
            style={{ flex: 1, fontFamily: font.sansMedium, fontSize: 15, color: color.ink }}
          />
          <View
            style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}
          >
            <Icon name="send" size={18} strokeWidth={2.6} color={color.volt} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Chat() {
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          alignSelf: 'flex-start',
          maxWidth: '90%',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: radius.bubble,
          borderBottomLeftRadius: radius.tail,
          backgroundColor: color.surface,
          gap: 12,
        }}
      >
        <Text style={[type.body, { fontFamily: font.sans, lineHeight: 21 }]}>
          I will read your sets, food and weight and suggest one change at a time. I am not connected yet.
        </Text>
        <View style={{ padding: 14, borderRadius: radius.inset, backgroundColor: color.paper, gap: 6 }}>
          <Text style={[type.body, { fontFamily: font.sansSemi }]}>What I will check first</Text>
          <Text style={type.caption}>Weight trend against +0.3–0.5 kg a week, and lifts that stall for two sessions.</Text>
        </View>
      </View>
    </View>
  );
}

function ThisWeek() {
  const routines = useData(getRoutines);
  const week = useData(weekWorkouts);
  const today = isoWeekday();
  const scheduled = routines.filter((r) => r.weekday != null).sort((a, b) => (a.weekday as number) - (b.weekday as number));
  return (
    <Card rows>
      <Rows>
        {WEEKDAY_SHORT.map((d, i) => {
          const wd = i + 1;
          const r = scheduled.find((x) => x.weekday === wd);
          const done = week.some((w) => w.weekday === wd);
          const isToday = wd === today;
          return (
            <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 }}>
              <Text style={[type.caption, { width: 40, fontFamily: font.sansSemi, color: isToday ? color.ink : color.inkMuted }]}>{d}</Text>
              <Text style={[type.body, { flex: 1, fontFamily: r ? font.sansSemi : font.sansMedium, color: r ? color.ink : color.inkMuted }]}>
                {r ? r.name : 'Rest'}
              </Text>
              {done ? <Tick done size={24} /> : isToday ? <Text style={[type.caption, { color: color.ink, fontFamily: font.sansSemi }]}>Today</Text> : null}
            </View>
          );
        })}
      </Rows>
    </Card>
  );
}
