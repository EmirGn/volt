import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeWorkout, lastLoggedSet } from '../db/queries';
import { fmtKg } from '../lib/format';
import { color, font, radius, space, type } from '../theme';
import { Icon } from './Icon';

const pad = (n: number) => String(n).padStart(2, '0');

function buildLog(error: Error) {
  const stack = (error.stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(error.name))
    .slice(0, 6)
    .map((l) => `  ${l}`);
  const cfg = Constants.expoConfig;
  const build = Platform.OS === 'ios' ? cfg?.ios?.buildNumber : cfg?.android?.versionCode;
  const model = (Platform.constants as { Model?: string }).Model;
  const d = new Date();
  return [
    `${error.name}: ${error.message}`,
    ...stack,
    `volt ${cfg?.version ?? '?'} (${build ?? '?'}) · ${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}${model ? ` · ${model}` : ''}`,
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  ].join('\n');
}

/** What survived, read defensively: the database itself might be what broke. */
function savedWork() {
  try {
    const w = activeWorkout();
    if (!w) return null;
    const last = lastLoggedSet(w.id);
    return { name: w.name, last };
  } catch {
    return null;
  }
}

/** Volt's error screen, used as expo-router's ErrorBoundary. Never depends on providers above it. */
export function ErrorScreen({ error, retry, label }: { error: Error; retry: () => Promise<void>; label: string }) {
  return (
    <SafeAreaProvider>
      <ErrorBody error={error} retry={retry} label={label} />
    </SafeAreaProvider>
  );
}

function ErrorBody({ error, retry, label }: { error: Error; retry: () => Promise<void>; label: string }) {
  const insets = useSafeAreaInsets();
  const log = useMemo(() => buildLog(error), [error]);
  const saved = useMemo(savedWork, []);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const goToday = () => {
    try {
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    } catch {
      // The navigator may be what failed; retrying below still re-renders.
    }
    retry();
  };

  const smallBtn = (text: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>{text}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.screenTop - 12, paddingHorizontal: space.gutter, paddingBottom: 16, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, minHeight: 44 }}>
          <Text style={type.pageLabel}>{label}</Text>
          <Text style={type.caption}>Error</Text>
        </View>

        <View style={{ gap: 10, paddingTop: 24, paddingHorizontal: 4 }}>
          <Text style={type.hero}>Hm.</Text>
          <Text accessibilityRole="header" style={type.title}>
            This screen hit a snag
          </Text>
          <Text style={[type.body, { fontFamily: font.sans, lineHeight: 22, color: color.inkMuted }]}>
            {saved
              ? 'Your workout is saved up to the last set you logged. Nothing was lost.'
              : 'Everything you logged is saved on this phone. Nothing was lost.'}
          </Text>
        </View>

        {saved?.last ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 16, borderRadius: radius.bubble, backgroundColor: color.surface }}>
            <View style={{ width: 36, height: 36, borderRadius: 36, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} strokeWidth={3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.sansSemi }]}>
                {saved.name} · {saved.last.exercises} {saved.last.exercises === 1 ? 'exercise' : 'exercises'} saved
              </Text>
              <Text style={type.caption}>
                Last: {saved.last.name.toLowerCase()}, {fmtKg(saved.last.kg)} kg × {saved.last.reps}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ backgroundColor: color.surface, borderRadius: radius.card, paddingVertical: 8, paddingHorizontal: space.cardPad }}>
          <Pressable
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 }}
          >
            <Text style={[type.body, { fontFamily: font.sansSemi }]}>Error details</Text>
            <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
              <Icon name="chevron" size={18} strokeWidth={2.2} color={color.inkMuted} />
            </View>
          </Pressable>
          {open ? (
            <View style={{ gap: 10, paddingBottom: 12 }}>
              <Text
                selectable
                style={{
                  padding: 14,
                  borderRadius: radius.inset,
                  overflow: 'hidden',
                  backgroundColor: color.ink,
                  color: '#E6E6E0',
                  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                  fontSize: 11.5,
                  lineHeight: 18,
                }}
              >
                {log}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {smallBtn(copied ? 'Copied' : 'Copy log', () => {
                  Clipboard.setStringAsync(log).then(() => setCopied(true), () => {});
                })}
                {smallBtn('Share log', () => {
                  Share.share({ message: log }).catch(() => {});
                })}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: Math.max(26, insets.bottom), gap: 8 }}>
        <Pressable
          onPress={() => retry()}
          accessibilityRole="button"
          style={({ pressed }) => [
            { minHeight: 56, borderRadius: radius.pill, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[type.lead, { color: color.inkInverse }]}>Try again</Text>
          <Icon name="retry" size={18} strokeWidth={2.6} color={color.volt} />
        </Pressable>
        <Pressable
          onPress={goToday}
          accessibilityRole="button"
          style={({ pressed }) => [
            { minHeight: 52, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={type.lead}>Go to Today</Text>
        </Pressable>
      </View>
    </View>
  );
}
