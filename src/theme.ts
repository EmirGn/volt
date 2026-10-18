// Volt design tokens, ported one to one from the Volt design system (tokens.json).
import type { TextStyle } from 'react-native';

export const color = {
  paper: '#F2F2EE',
  surface: '#FFFFFF',
  ink: '#111111',
  inkMuted: '#6B6B66',
  inkSubtle: '#9A9A93', // on ink only
  inkInverse: '#FFFFFF',
  inkInverseMuted: '#B5B5AE', // on ink only
  line: '#ECECE6',
  // The design system flags #C9C9C2 as failing 3:1 for control boundaries; this is its suggested fix.
  lineStrong: '#8A8A84',
  volt: '#CCF547',
  onVolt: '#111111',
  track: '#DCDCD5',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  gutter: 16,
  stack: 18,
  cardPad: 20,
  screenTop: 28,
  dockClear: 110,
} as const;

export const radius = {
  tail: 6,
  inset: 18,
  bubble: 22,
  card: 30,
  pill: 999,
} as const;

export const size = {
  touchMin: 44,
  tabH: 46,
  buttonH: 52,
  dockItem: 52,
  ctaH: 60,
} as const;

export const font = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemi: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
} as const;

export const type = {
  hero: { fontFamily: font.display, fontSize: 116, lineHeight: 112, letterSpacing: -5.8, color: color.ink },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.8, color: color.ink },
  stat: { fontFamily: font.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, color: color.ink },
  lead: { fontFamily: font.sansSemi, fontSize: 16, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.sansMedium, fontSize: 15, lineHeight: 21, color: color.ink },
  caption: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18, color: color.inkMuted },
  label: { fontFamily: font.sansSemi, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase', color: color.inkMuted },
  pageLabel: { fontFamily: font.sansSemi, fontSize: 15, lineHeight: 20, color: color.ink },
} satisfies Record<string, TextStyle>;

export const theme = { color, space, radius, size, font, type };
export default theme;
