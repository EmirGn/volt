import { useMemo, useState } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { VoltMark } from '../components/Mark';
import { getPlanItems, nextRoutine, workoutTime } from '../db/queries';
import { markNotificationsAsked, requestNotifications } from '../lib/notifications';
import { color, font, radius, space, type } from '../theme';

/** Asked once, before the system prompt, so the "Allow" there is an informed one. */
export default function NotificationsPrompt() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  // The two previews use the real plan so they read like what will actually arrive.
  const preview = useMemo(() => {
    const r = nextRoutine();
    const items = r ? getPlanItems(r.id) : [];
    const [h, m] = workoutTime().split(':').map(Number);
    const at = new Date(2000, 0, 1, h, m - 15);
    return {
      rest: items[1] ? `Set 2 of ${items[1].name.toLowerCase()}` : 'Set 2 of bench press',
      title: r ? `${r.name} in 15 minutes` : 'Upper A in 15 minutes',
      body: `${items.length || 5} exercises${items[0] ? ` · starts with ${items[0].name.toLowerCase()}` : ''}`,
      time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
    };
  }, []);

  const skip = () => {
    markNotificationsAsked();
    router.back();
  };

  const allow = async () => {
    setBusy(true);
    try {
      await requestNotifications();
    } finally {
      router.back();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View style={{ flex: 1, paddingTop: insets.top + space.screenTop - 12, paddingHorizontal: space.gutter, gap: 28 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            style={({ pressed }) => [
              { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: color.surface, justifyContent: 'center' },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>Skip</Text>
          </Pressable>
        </View>

        <View style={{ height: 250 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View
            style={{
              position: 'absolute',
              left: 34,
              right: 34,
              top: 0,
              padding: 14,
              borderRadius: radius.bubble,
              backgroundColor: '#E6E6E0',
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
              transform: [{ scale: 0.9 }],
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: color.ink }} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ height: 8, width: '60%', borderRadius: 8, backgroundColor: '#CFCFC8' }} />
              <View style={{ height: 8, width: '85%', borderRadius: 8, backgroundColor: '#CFCFC8' }} />
            </View>
          </View>
          <Notice style={{ top: 40 }} time="now" title="Rest's over" body={preview.rest} />
          <Notice style={{ top: 150, transform: [{ rotate: '-2deg' }] }} time={preview.time} title={preview.title} body={preview.body} />
        </View>

        <View style={{ gap: 10, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={[type.title, { fontSize: 40, lineHeight: 42, letterSpacing: -1.6 }]}>
            Never miss the end of a rest
          </Text>
          <Text style={[type.lead, { fontFamily: font.sans, lineHeight: 23, color: color.inkMuted }]}>
            Volt only notifies you when a rest timer ends or a planned workout is about to start. Nothing else.
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: Math.max(26, insets.bottom), gap: 8 }}>
        <Pressable
          onPress={allow}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            { minHeight: 56, borderRadius: radius.pill, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
            (pressed || busy) && { opacity: 0.6 },
          ]}
        >
          <Text style={[type.lead, { color: color.inkInverse }]}>Allow notifications</Text>
          <Icon name="arrow" size={18} strokeWidth={2.6} color={color.volt} />
        </Pressable>
        <Text style={[type.caption, { textAlign: 'center', paddingTop: 4 }]}>You can change this in Settings any time.</Text>
      </View>
    </View>
  );
}

function Notice({ style, time, title, body }: { style: StyleProp<ViewStyle>; time: string; title: string; body: string }) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          padding: 16,
          borderRadius: 24,
          backgroundColor: color.surface,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'flex-start',
        },
        style,
      ]}
    >
      <View style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden' }}>
        <VoltMark size={42} tile />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>Volt</Text>
          <Text style={[type.caption, { fontSize: 12 }]}>{time}</Text>
        </View>
        <Text style={[type.body, { fontFamily: font.sansSemi }]}>{title}</Text>
        <Text numberOfLines={1} style={[type.body, { fontFamily: font.sans, fontSize: 14, color: color.inkMuted }]}>
          {body}
        </Text>
      </View>
    </View>
  );
}
