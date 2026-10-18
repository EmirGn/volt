// Volt's own confirmations, toasts and banners, replacing the platform's Alert and toast UI
// ("Dialogs & feedback" page of the design canvas).
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { useNetworkState } from 'expo-network';
import { color, font, radius, size, type } from '../theme';
import { Icon, IconName } from './Icon';

const sheetEase = Easing.bezier(0.16, 1, 0.3, 1);

// ---------- API ----------

export type ToastKind = 'success' | 'info' | 'error';
export type ToastOptions = {
  kind?: ToastKind;
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
};

/** Renders a sheet's content. `close` slides it away, then runs the sheet's onClose. */
export type SheetRender = (close: () => void) => ReactNode;
export type SheetOptions = { onClose?: () => void };

type Feedback = {
  toast: (t: ToastOptions) => void;
  sheet: (render: SheetRender, opts?: SheetOptions) => void;
  /** Swaps the open sheet's content without closing it, e.g. "Finish workout?" → "Workout saved". */
  replaceSheet: (render: SheetRender, opts?: SheetOptions) => void;
  closeSheet: () => void;
};

const Ctx = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const f = useContext(Ctx);
  if (!f) throw new Error('useFeedback needs <FeedbackProvider>');
  return f;
}

// ---------- provider ----------

type ToastState = ToastOptions & { id: number };
type SheetState = { id: number; render: SheetRender; onClose?: () => void };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toastState, setToast] = useState<ToastState | null>(null);
  const [sheetState, setSheet] = useState<SheetState | null>(null);
  const seq = useRef(0);

  const toast = useCallback((t: ToastOptions) => setToast({ ...t, id: ++seq.current }), []);
  const sheet = useCallback((render: SheetRender, opts?: SheetOptions) => {
    setToast(null);
    setSheet({ id: ++seq.current, render, onClose: opts?.onClose });
  }, []);
  const replaceSheet = useCallback(
    (render: SheetRender, opts?: SheetOptions) =>
      setSheet((s) => (s ? { ...s, render, onClose: opts?.onClose } : { id: ++seq.current, render, onClose: opts?.onClose })),
    [],
  );
  const closeRef = useRef<() => void>(() => {});
  const closeSheet = useCallback(() => closeRef.current(), []);
  const api = useMemo(() => ({ toast, sheet, replaceSheet, closeSheet }), [toast, sheet, replaceSheet, closeSheet]);

  const hideToast = useCallback((id: number) => setToast((t) => (t?.id === id ? null : t)), []);
  const sheetClosed = useCallback(() => setSheet(null), []);

  const layer = (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ToastHost toast={toastState} onHide={hideToast} />
      <SheetHost sheet={sheetState} closeRef={closeRef} onClosed={sheetClosed} />
    </View>
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* On iOS, native modals (the workout screen) sit above the React root, so the layer lives in its own window. */}
      {Platform.OS === 'ios' ? <FullWindowOverlay>{layer}</FullWindowOverlay> : layer}
    </Ctx.Provider>
  );
}

// ---------- sheet ----------

function SheetHost({
  sheet,
  closeRef,
  onClosed,
}: {
  sheet: SheetState | null;
  closeRef: { current: () => void };
  onClosed: () => void;
}) {
  const insets = useSafeAreaInsets();
  const open = useRef(new Animated.Value(0)).current;
  const [h, setH] = useState(600);
  const visible = !!sheet;

  useEffect(() => {
    if (!visible) return;
    open.setValue(0);
    Animated.timing(open, { toValue: 1, duration: 420, easing: sheetEase, useNativeDriver: true }).start();
  }, [visible, open, sheet?.id]);

  closeRef.current = () => {
    if (!sheet) return;
    const after = sheet.onClose;
    Animated.timing(open, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      onClosed();
      after?.();
    });
  };

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible, closeRef]);

  if (!sheet) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17,17,17,0.48)', opacity: open }]}>
        <Pressable style={{ flex: 1 }} onPress={() => closeRef.current()} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: Math.max(8, insets.bottom),
          paddingTop: 28,
          paddingHorizontal: 22,
          paddingBottom: 22,
          borderRadius: radius.card,
          backgroundColor: color.surface,
          transform: [{ translateY: open.interpolate({ inputRange: [0, 1], outputRange: [h + 40, 0] }) }],
        }}
      >
        {sheet.render(() => closeRef.current())}
      </Animated.View>
    </View>
  );
}

/** The round paper badge at the top of a sheet. */
export function SheetIcon({ name, volt }: { name: IconName; volt?: boolean }) {
  const s = volt ? 76 : 52;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s,
        backgroundColor: volt ? color.volt : color.paper,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: volt ? 'center' : 'flex-start',
      }}
    >
      <Icon name={name} size={volt ? 34 : 24} strokeWidth={volt ? 2.8 : 2} color={color.ink} />
    </View>
  );
}

export function SheetTitle({ title, body, center }: { title: string; body?: string; center?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityRole="header"
        style={[type.title, { fontSize: 30, lineHeight: 32, letterSpacing: -0.9, textAlign: center ? 'center' : 'left' }]}
      >
        {title}
      </Text>
      {body ? <Text style={[type.body, { fontFamily: font.sans, lineHeight: 22, color: color.inkMuted, textAlign: center ? 'center' : 'left' }]}>{body}</Text> : null}
    </View>
  );
}

/** Three small stats in a sunken paper box, e.g. time / sets / lifted. */
export function SheetStats({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, padding: 14, borderRadius: radius.inset, backgroundColor: color.paper }}>
      {stats.map((s) => (
        <View key={s.label} style={{ flex: 1, gap: 2 }}>
          <Text style={type.stat}>{s.value}</Text>
          <Text style={type.caption}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function SheetButton({
  label,
  onPress,
  variant = 'ink',
  trailing,
}: {
  label: string;
  onPress: () => void;
  variant?: 'ink' | 'paper';
  trailing?: IconName;
}) {
  const ink = variant === 'ink';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          minHeight: ink ? 56 : 52,
          borderRadius: radius.pill,
          backgroundColor: ink ? color.ink : color.paper,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: 20,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[type.lead, { color: ink ? color.inkInverse : color.ink }]}>{label}</Text>
      {trailing ? <Icon name={trailing} size={18} strokeWidth={2.8} color={ink ? color.volt : color.ink} /> : null}
    </Pressable>
  );
}

/** A plain confirm sheet: icon, title, body, optional stats, a primary and a "keep going" button. */
export function ConfirmSheet({
  icon,
  title,
  body,
  stats,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  close,
}: {
  icon: IconName;
  title: string;
  body?: string;
  stats?: { value: string; label: string }[];
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  close: () => void;
}) {
  return (
    <View style={{ gap: 18 }}>
      <SheetIcon name={icon} />
      <SheetTitle title={title} body={body} />
      {stats ? <SheetStats stats={stats} /> : null}
      <View style={{ gap: 8 }}>
        <SheetButton label={confirmLabel} trailing="check" onPress={onConfirm} />
        <SheetButton label={cancelLabel} variant="paper" onPress={close} />
      </View>
    </View>
  );
}

/** "Workout saved"-style success: a big volt tick, a title, a line, one button. */
export function DoneSheet({ title, body, actionLabel, close }: { title: string; body?: string; actionLabel: string; close: () => void }) {
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }).start();
  }, [pop]);
  return (
    <View style={{ gap: 16, paddingTop: 6 }}>
      <Animated.View style={{ transform: [{ scale: pop }], alignSelf: 'center' }}>
        <SheetIcon name="check" volt />
      </Animated.View>
      <SheetTitle title={title} body={body} center />
      <SheetButton label={actionLabel} onPress={close} />
    </View>
  );
}

// ---------- hold to delete ----------

const HOLD_MS = 1000;

/** Deleting needs a one-second hold instead of a red button. The fill sweeps ink across the pill. */
export function HoldToDeleteSheet({
  title,
  body,
  onDelete,
  close,
}: {
  title: string;
  body?: string;
  onDelete: () => void;
  close: () => void;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const progress = useRef(0);
  const [w, setW] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const id = fill.addListener(({ value }) => (progress.current = value));
    return () => fill.removeListener(id);
  }, [fill]);

  const press = () => {
    if (done.current) return;
    fill.stopAnimation();
    // Resume from wherever a released fill had drained back to.
    Animated.timing(fill, { toValue: 1, duration: HOLD_MS * (1 - progress.current), easing: Easing.linear, useNativeDriver: false }).start(
      ({ finished }) => {
        if (!finished || done.current) return;
        done.current = true;
        onDelete();
      },
    );
  };
  const release = () => {
    if (done.current) return;
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  };

  const label = (fg: string) => (
    <View style={{ width: w || undefined, height: 60, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.lead, { color: fg }]}>Hold to delete</Text>
    </View>
  );

  return (
    <View style={{ gap: 18 }}>
      <SheetIcon name="trash" />
      <SheetTitle title={title} body={body} />
      <Pressable
        onPressIn={press}
        onPressOut={release}
        accessibilityRole="button"
        accessibilityLabel={`Hold to delete. ${title}`}
        accessibilityHint="Hold for one second"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => {
          done.current = true;
          onDelete();
        }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ height: 60, borderRadius: radius.pill, backgroundColor: color.paper, overflow: 'hidden' }}
      >
        {label(color.ink)}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
            backgroundColor: color.ink,
            width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        >
          {label(color.inkInverse)}
        </Animated.View>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.caption}>Hold for 1 second</Text>
        <Pressable onPress={close} accessibilityRole="button" style={{ minHeight: size.touchMin, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={[type.body, { fontFamily: font.sansSemi }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- toasts ----------

const TAB_PATHS = new Set(['/', '/train', '/food', '/coach', '/progress']);

function ToastHost({ toast, onHide }: { toast: ToastState | null; onHide: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => finished && setShown(null));
      return;
    }
    setShown(toast);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 420, easing: sheetEase, useNativeDriver: true }).start();
    const t = setTimeout(() => onHide(toast.id), toast.action ? 4500 : 2600);
    return () => clearTimeout(t);
  }, [toast, anim, onHide]);

  if (!shown) return null;

  // Sit just above whatever is pinned to the bottom: the dock, the coach input, or a full-width CTA.
  const base = Math.max(26, insets.bottom);
  const bottom =
    pathname === '/coach' ? base + 78 + 54 + 12 : TAB_PATHS.has(pathname) ? base + 78 : pathname === '/workout' ? base + size.ctaH + 12 : base + 4;

  const kind = shown.kind ?? 'success';
  const badge =
    kind === 'success'
      ? { bg: color.volt, fg: color.onVolt, icon: 'check' as const, sw: 3 }
      : kind === 'info'
        ? { bg: '#2B2B28', fg: color.paper, icon: 'timer' as const, sw: 2.2 }
        : { bg: color.paper, fg: color.ink, icon: 'alert' as const, sw: 2.8 };

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        paddingVertical: 8,
        paddingLeft: 10,
        paddingRight: 8,
        borderRadius: radius.pill,
        backgroundColor: color.ink,
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 40, backgroundColor: badge.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={badge.icon} size={18} strokeWidth={badge.sw} color={badge.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { fontFamily: font.sansSemi, color: color.paper }]}>
          {shown.title}
        </Text>
        {shown.detail ? (
          <Text numberOfLines={1} style={[type.caption, { color: color.inkInverseMuted }]}>
            {shown.detail}
          </Text>
        ) : null}
      </View>
      {shown.action ? (
        <Pressable
          onPress={() => {
            shown.action?.onPress();
            onHide(shown.id);
          }}
          accessibilityRole="button"
          style={{ minHeight: size.touchMin, paddingHorizontal: 16, justifyContent: 'center' }}
        >
          <Text style={[type.body, { fontFamily: font.sansSemi, color: color.volt }]}>{shown.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// ---------- offline banner ----------

let dismissedWhileOffline = false;

/** Shown on Today and Coach while there's no connection. Logging works offline; only Coach needs the network. */
export function OfflineBanner() {
  const net = useNetworkState();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  const [dismissed, setDismissed] = useState(dismissedWhileOffline);

  useEffect(() => {
    if (!offline) {
      dismissedWhileOffline = false;
      setDismissed(false);
    }
  }, [offline]);

  if (!offline || dismissed) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, borderRadius: radius.inset, backgroundColor: color.surface }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>You're offline</Text>
        <Text style={type.caption}>Logging works. Coach is back when you are.</Text>
      </View>
      <Pressable
        onPress={() => {
          dismissedWhileOffline = true;
          setDismissed(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={{ width: 40, height: 40, borderRadius: 40, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="close" size={16} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}
