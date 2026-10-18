import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activeWorkout, activityStreak, isoWeekday, nextRoutine, todaysRoutine, weekWorkouts, workoutTime } from '../db/queries';
import { weekdayName } from '../lib/format';
import { color, font, radius } from '../theme';
import { Icon } from './Icon';
import { VoltMark } from './Mark';

// Timeline from the "Opening: Streak" board: the ink curtain (which matches the native splash) lifts,
// the last six days fill in, then today pops volt and the streak counts up by one.
const LIFT_AT = 800;
const FILL_AT = 1350;
const POP_AT = 2350;
const LEAVE_AT = 3500;

const curtainEase = Easing.bezier(0.76, 0, 0.24, 1);
const popEase = Easing.bezier(0.34, 1.56, 0.64, 1);
const outEase = Easing.bezier(0.16, 1, 0.3, 1);

function todayLine(): string {
  const active = activeWorkout();
  if (active) return `Resume ${active.name}`;
  const today = todaysRoutine();
  const doneToday = weekWorkouts().some((w) => w.weekday === isoWeekday());
  if (today && !doneToday) return `Today: ${today.name} · ${workoutTime()}`;
  if (today && doneToday) return `${today.name} done`;
  const next = nextRoutine();
  return next?.weekday ? `Rest day · ${next.name} on ${weekdayName(next.weekday)}` : 'Rest day';
}

export function Opening({ onDone }: { onDone: () => void }) {
  const { height } = useWindowDimensions();
  const data = useMemo(() => ({ ...activityStreak(), line: todayLine() }), []);
  const [phase, setPhase] = useState(0);

  const curtain = useRef(new Animated.Value(0)).current;
  const fills = useRef(data.days.map(() => new Animated.Value(0))).current;
  const pop = useRef(new Animated.Value(0)).current;
  const num = useRef(new Animated.Value(0.88)).current;
  const pill = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const leaving = useRef(false);

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(fade, { toValue: 0, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    const timers = [
      setTimeout(() => {
        setPhase(1);
        Animated.timing(curtain, { toValue: 1, duration: 680, easing: curtainEase, useNativeDriver: true }).start();
      }, LIFT_AT),
      setTimeout(() => {
        Animated.stagger(
          90,
          fills.slice(0, 6).map((v, i) =>
            Animated.timing(v, { toValue: data.days[i].active ? 1 : 0, duration: 260, useNativeDriver: true }),
          ),
        ).start();
      }, FILL_AT),
      setTimeout(() => {
        setPhase(2);
        Animated.parallel([
          Animated.timing(pop, { toValue: data.today ? 1 : 0, duration: 460, easing: popEase, useNativeDriver: true }),
          Animated.timing(num, { toValue: 1, duration: 460, easing: popEase, useNativeDriver: true }),
          Animated.timing(pill, { toValue: 1, duration: 520, delay: 200, easing: outEase, useNativeDriver: true }),
        ]).start();
      }, POP_AT),
      setTimeout(leave, LEAVE_AT),
    ];
    return () => timers.forEach(clearTimeout);
    // Runs once per cold launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = phase >= 2 ? data.streak : data.before;
  const done = data.days.slice(0, 6).filter((d) => d.active).length;

  return (
    <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: fade }}>
      <StatusBar style={phase === 0 ? 'light' : 'dark'} />
      <Pressable
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel={`${data.streak} day streak. ${data.line}. Tap to continue`}
        style={{ flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 30 }}
      >
        <View style={{ flexDirection: 'row', gap: 10 }} accessibilityLabel={`Last 7 days: ${done} of 6 active${data.today ? ', today done' : ''}`}>
          {data.days.map((d, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ width: 40, height: 40 }}>
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    borderRadius: 40,
                    borderWidth: 2,
                    borderColor: d.today ? color.ink : color.lineStrong,
                  }}
                />
                {!d.today ? (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      borderRadius: 40,
                      backgroundColor: color.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: fills[i],
                    }}
                  >
                    <Icon name="check" size={16} strokeWidth={3} color={color.inkInverse} />
                  </Animated.View>
                ) : (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      borderRadius: 40,
                      backgroundColor: color.volt,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ scale: pop }],
                    }}
                  >
                    <Icon name="check" size={16} strokeWidth={3} color={color.onVolt} />
                  </Animated.View>
                )}
              </View>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 11, letterSpacing: 0.9, color: d.today ? color.ink : color.inkMuted }}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Animated.Text
            style={{
              fontFamily: font.display,
              fontSize: 168,
              // A full line height so iOS doesn't crop the glyph tops; negative margins pull it tight again.
              lineHeight: 196,
              marginTop: -18,
              marginBottom: -40,
              letterSpacing: -10,
              // Negative tracking shrinks the text box on iOS and clips the last digit.
              paddingHorizontal: 12,
              color: color.ink,
              transform: [{ scale: num }],
            }}
          >
            {shown}
          </Animated.Text>
          <Text style={{ fontFamily: font.sans, fontSize: 17, color: color.inkMuted }}>day streak</Text>
        </View>

        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            paddingLeft: 10,
            paddingRight: 16,
            borderRadius: radius.pill,
            backgroundColor: color.surface,
            opacity: pill,
            transform: [{ translateY: pill.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 32, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="dumbbell" size={16} strokeWidth={2.2} color={color.volt} />
          </View>
          <Text style={{ fontFamily: font.sansSemi, fontSize: 15, color: color.ink }}>{data.line}</Text>
        </Animated.View>
      </Pressable>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: color.ink,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: curtain.interpolate({ inputRange: [0, 1], outputRange: [0, -height] }) }],
        }}
      >
        <VoltMark size={120} />
      </Animated.View>
    </Animated.View>
  );
}
