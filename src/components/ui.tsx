import { Children, Fragment, isValidElement, ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { color, font, radius, size, space, type } from '../theme';
import { Icon, IconName } from './Icon';

// ---------- layout ----------

export function Screen({ children, bottom = space.dockClear }: { children: ReactNode; bottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.paper }}
      contentContainerStyle={{
        paddingTop: insets.top + space.screenTop - 12,
        paddingHorizontal: space.gutter,
        paddingBottom: bottom + insets.bottom,
        gap: space.stack,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Header({
  label,
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <Text style={type.pageLabel}>{label}</Text>
      {icon ? <RoundButton icon={icon} onPress={onPress} accessibilityLabel={accessibilityLabel ?? label} /> : null}
    </View>
  );
}

export function RoundButton({
  icon,
  onPress,
  accessibilityLabel,
  strokeWidth = 2,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.round, pressed && styles.pressed, style]}
    >
      <Icon name={icon} size={20} strokeWidth={strokeWidth} />
    </Pressable>
  );
}

// ---------- display ----------

export function HeroNumber({
  value,
  suffix,
  caption,
  children,
}: {
  value: string;
  suffix?: string;
  caption?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero} accessibilityRole="summary">
      <Text style={type.hero} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {suffix ? <Text style={{ color: color.inkMuted }}>{suffix}</Text> : null}
      </Text>
      {caption ? <Text style={[type.lead, { fontFamily: font.sans, color: color.inkMuted }]}>{caption}</Text> : null}
      {children ? <View style={styles.heroChips}>{children}</View> : null}
    </View>
  );
}

export function Chip({ label, volt }: { label: string; volt?: boolean }) {
  return (
    <View style={[styles.chip, volt && { backgroundColor: color.volt }]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function MacroChip({ letter, value, target }: { letter: string; value: number; target: number }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, target ? value / target : 0));
  return (
    <View style={[styles.chip, { paddingLeft: 7, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Circle cx={13} cy={13} r={r} fill="none" stroke={color.line} strokeWidth={4} />
        {pct > 0 ? (
          <Circle
            cx={13}
            cy={13}
            r={r}
            fill="none"
            stroke={color.ink}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform="rotate(-90 13 13)"
          />
        ) : null}
      </Svg>
      <Text style={styles.chipText} accessibilityLabel={`${letter} ${Math.round(value)} of ${target} grams`}>
        {letter} {Math.round(value)}/{target}
      </Text>
    </View>
  );
}

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={[styles.chipText, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

// ---------- navigation ----------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onChange(o.id);
            }}
            style={[styles.segment, active && { backgroundColor: color.ink }]}
          >
            <Text style={[type.body, { fontFamily: font.sansSemi, color: active ? color.inkInverse : color.inkMuted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- containers ----------

export function Card({ children, style, rows }: { children: ReactNode; style?: StyleProp<ViewStyle>; rows?: boolean }) {
  return <View style={[styles.card, rows && { paddingVertical: 8 }, style]}>{children}</View>;
}

/** Puts a hairline between each child, like the card rows in the design. */
export function Rows({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.hairline} /> : null}
          {child}
        </Fragment>
      ))}
    </>
  );
}

export function Row({
  title,
  subtitle,
  value,
  right,
  onPress,
  minHeight = 56,
  titleStyle,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  minHeight?: number;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const content = (
    <View style={[styles.row, { minHeight }]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.body, { fontFamily: subtitle ? font.sansSemi : font.sansMedium }, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[type.body, { color: color.inkMuted, fontSize: 14 }]}>{value}</Text> : null}
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

// ---------- actions ----------

export function Button({
  label,
  onPress,
  variant = 'ink',
  trailing,
  height = size.buttonH,
  style,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'ink' | 'volt' | 'outline' | 'surface' | 'paper';
  trailing?: IconName;
  height?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const bg = { ink: color.ink, volt: color.volt, outline: 'transparent', surface: color.surface, paper: color.paper }[variant];
  const fg = variant === 'ink' ? color.inkInverse : color.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, minHeight: height },
        variant === 'outline' && { borderWidth: 1.5, borderColor: color.lineStrong },
        pressed && styles.pressed,
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text style={[type.lead, { color: fg, fontSize: height >= size.ctaH ? 17 : height < 44 ? 14 : 16 }]}>{label}</Text>
      {trailing ? (
        <Icon name={trailing} size={height >= size.ctaH ? 20 : 18} strokeWidth={2.7} color={variant === 'ink' ? color.volt : color.ink} />
      ) : null}
    </Pressable>
  );
}

export function SmallButton({ label, onPress, volt }: { label: string; onPress?: () => void; volt?: boolean }) {
  return <Button label={label} onPress={onPress} variant={volt ? 'volt' : 'outline'} height={40} style={{ paddingHorizontal: 18 }} />;
}

// ---------- inputs ----------

export function Tick({ done, size: s = 28 }: { done: boolean; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (done) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
    }
  }, [done, scale]);
  if (!done) {
    return <View style={{ width: s, height: s, borderRadius: s, borderWidth: 2, borderColor: color.lineStrong }} />;
  }
  return (
    <Animated.View
      style={{
        width: s,
        height: s,
        borderRadius: s,
        backgroundColor: color.volt,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      <Icon name="check" size={s * 0.54} strokeWidth={3} />
    </Animated.View>
  );
}

export function CheckRow({
  label,
  meta,
  done,
  onToggle,
}: {
  label: string;
  meta?: string;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      style={({ pressed }) => [styles.row, { minHeight: 56 }, pressed && styles.pressed]}
    >
      <Tick done={done} />
      <Text
        style={[
          type.body,
          { flex: 1 },
          done ? { color: color.inkMuted, textDecorationLine: 'line-through' } : { fontFamily: font.sansSemi },
        ]}
      >
        {label}
      </Text>
      {meta ? <Text style={type.caption}>{meta}</Text> : null}
    </Pressable>
  );
}

export function Stepper({
  label,
  onMinus,
  onPlus,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onMinus}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label.toLowerCase()}`}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
      >
        <Icon name="minus" size={20} strokeWidth={2.4} />
      </Pressable>
      <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>{label}</Text>
      <Pressable
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label.toLowerCase()}`}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
      >
        <Icon name="plus" size={20} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

export function EmptyNote({ children }: { children: string }) {
  return <Text style={[type.caption, { paddingVertical: 14 }]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, minHeight: size.touchMin },
  round: {
    width: size.touchMin,
    height: size.touchMin,
    borderRadius: size.touchMin,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  hero: { alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 4 },
  heroChips: { flexDirection: 'row', gap: space.sm, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: color.surface },
  chipText: { fontFamily: font.sansSemi, fontSize: 13, color: color.ink },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: color.volt },
  segmented: {
    flexDirection: 'row',
    gap: space.xs,
    padding: 5,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  segment: { flex: 1, minHeight: size.tabH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: space.cardPad, paddingVertical: space.cardPad },
  hairline: { height: 1, backgroundColor: color.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8 },
  button: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  stepBtn: {
    width: 46,
    height: 46,
    borderRadius: 46,
    backgroundColor: color.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
