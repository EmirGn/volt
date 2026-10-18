import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { color } from '../theme';

/** The "V." monogram from assets/volt-icon.svg. `tile` draws it on its ink square, like the app icon. */
export function VoltMark({ size, tile }: { size: number; tile?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityElementsHidden importantForAccessibility="no">
      {tile ? <Rect width={1024} height={1024} fill={color.ink} /> : null}
      <G transform="translate(-28 0)">
        <Path
          d="M262 262H402L512 610L622 262H762L590 762H434Z"
          fill={color.paper}
          stroke={color.paper}
          strokeWidth={28}
          strokeLinejoin="round"
        />
        <Circle cx={712} cy={704} r={58} fill={color.volt} />
      </G>
    </Svg>
  );
}
