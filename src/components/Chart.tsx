// Line charts for Progress and the history screens. Lines draw in left to right, then the last point pops volt.
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';
import { color, font } from '../theme';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type Pt = { x: number; y: number };

const lengthOf = (pts: Pt[]) => pts.reduce((n, p, i) => (i ? n + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

/** Draws itself in over 500 ms. Change `drawKey` to draw it again, for example on a range switch. */
export function DrawLine({ pts, width = 4, drawKey }: { pts: Pt[]; width?: number; drawKey?: string }) {
  const len = Math.max(1, lengthOf(pts));
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [t, drawKey]);
  if (pts.length < 2) return null;
  return (
    <AnimatedPolyline
      points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke={color.ink}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${len} ${len}`}
      strokeDashoffset={t.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })}
    />
  );
}

/** The latest point: a volt dot with an ink ring that scales in once the line has arrived. */
export function EndDot({ at, r = 9, drawKey }: { at: Pt; r?: number; drawKey?: string }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    s.setValue(0);
    Animated.sequence([Animated.delay(420), Animated.spring(s, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: false })]).start();
  }, [s, drawKey]);
  return <AnimatedCircle cx={at.x} cy={at.y} r={s.interpolate({ inputRange: [0, 1], outputRange: [0, r] })} fill={color.volt} stroke={color.ink} strokeWidth={3} />;
}

/** Ink dots for every point but the last, as one path of zero-length round-capped strokes. */
export function Dots({ pts, size = 10 }: { pts: Pt[]; size?: number }) {
  if (!pts.length) return null;
  return <Path d={pts.map((p) => `M${p.x} ${p.y}h0`).join(' ')} stroke={color.ink} strokeWidth={size} strokeLinecap="round" fill="none" />;
}

/**
 * One series over time: two hairlines at the highest and lowest value with their labels,
 * the line, dots, and the latest point in volt. Labels name values the chart actually reaches.
 */
export function LineChart({
  values,
  format,
  from,
  to,
  label,
  drawKey,
  width = 318,
  height = 170,
}: {
  values: number[];
  format: (v: number) => string;
  from: string;
  to: string;
  label: string;
  drawKey?: string;
  width?: number;
  height?: number;
}) {
  const top = 32;
  const bottom = height - 42;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const step = values.length > 1 ? (width - 32) / (values.length - 1) : 0;
  const pts = values.map((v, i) => ({
    x: values.length > 1 ? 16 + i * step : width / 2,
    y: hi === lo ? (top + bottom) / 2 : bottom - ((v - lo) / span) * (bottom - top),
  }));
  const last = pts[pts.length - 1];
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={label}>
      <Line x1={0} y1={top} x2={width} y2={top} stroke={color.line} strokeWidth={1.5} />
      <Line x1={0} y1={bottom} x2={width} y2={bottom} stroke={color.line} strokeWidth={1.5} />
      <SvgText x={0} y={top - 9} fontSize={12} fontFamily={font.sansSemi} fill={color.inkMuted}>
        {format(hi)}
      </SvgText>
      {hi !== lo ? (
        <SvgText x={0} y={bottom + 18} fontSize={12} fontFamily={font.sansSemi} fill={color.inkMuted}>
          {format(lo)}
        </SvgText>
      ) : null}
      <DrawLine pts={pts} width={3.5} drawKey={drawKey} />
      <Dots pts={pts.slice(0, -1)} size={9} />
      {last ? <EndDot at={last} r={8} drawKey={drawKey} /> : null}
      <SvgText x={6} y={height - 4} fontSize={12} fontFamily={font.sansMedium} fill={color.inkMuted}>
        {from}
      </SvgText>
      <SvgText x={width - 6} y={height - 4} textAnchor="end" fontSize={12} fontFamily={font.sansMedium} fill={color.inkMuted}>
        {to}
      </SvgText>
    </Svg>
  );
}

/** A 68×30 trend for list rows. Static: a list full of drawing lines would be noise. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values.map((v, i) => ({ x: 4 + i * (60 / (values.length - 1)), y: 25 - ((v - lo) / span) * 20 }));
  const end = pts[pts.length - 1];
  return (
    <Svg width={68} height={30} viewBox="0 0 68 30" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={end.x} cy={end.y} r={3.5} fill={color.ink} />
    </Svg>
  );
}
