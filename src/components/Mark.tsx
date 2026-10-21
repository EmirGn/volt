import Svg, { Path, Rect } from 'react-native-svg';
import { color } from '../theme';

// The open-loop mark from assets/volt-mark.svg. Its box is 333..923 × 341..914, centred on (628, 627.5).
const D =
  'M 615.221 362.069 C 566.448 368.406, 516.200 403.620, 468.344 465 C 414.831 533.637, 367.645 631.302, 356.497 696.500 C 346.589 754.450, 360.741 807.278, 395.354 841.544 C 427.398 873.267, 468.602 887.145, 545.500 892.114 C 584.471 894.633, 696.554 893.325, 731 889.950 C 813.537 881.863, 861.902 854.396, 886.501 801.640 C 914.391 741.825, 906.016 664.201, 861.993 574.500 C 848.304 546.608, 836.318 526.343, 817.783 499.756 C 808.513 486.460, 806.340 484.720, 801.360 486.606 C 800.063 487.098, 786.851 499.349, 772 513.830 C 745.995 539.191, 745 540.301, 745 543.972 C 745 547.045, 745.834 548.725, 749.306 552.642 C 778.969 586.112, 806.248 629.865, 816.506 660.422 C 835.248 716.256, 812.032 756.312, 752.703 770.502 C 692.987 784.784, 596.022 773.857, 552.995 747.997 C 517.716 726.794, 504.882 690.650, 515.001 640.997 C 523.314 600.203, 554.592 539.731, 582.900 509.724 C 600.510 491.055, 615.475 484.293, 637 485.277 C 659.784 486.318, 685.647 497.434, 712.985 517.936 C 719.509 522.828, 723.280 525, 725.252 525 C 727.631 525, 732.947 520.276, 757.588 496.271 C 773.893 480.386, 787.340 466.494, 787.665 465.197 C 788.536 461.729, 787.166 459.503, 777.390 448.494 C 742.872 409.623, 711.983 384.820, 681.983 371.887 C 660.625 362.679, 637.128 359.223, 615.221 362.069';

/**
 * The Volt mark. Plain, it sits in the same 1072-unit frame as assets/splash-icon.png, so the opening
 * takes over from the native splash without a jump. `tile` draws it on its ink square, like the app icon.
 */
export function VoltMark({ size, tile }: { size: number; tile?: boolean }) {
  const side = tile ? 946 : 1072;
  const x = 628 - side / 2;
  const y = 627.5 - side / 2;
  return (
    <Svg width={size} height={size} viewBox={`${x} ${y} ${side} ${side}`} accessibilityElementsHidden importantForAccessibility="no">
      {tile ? <Rect x={x} y={y} width={side} height={side} fill={color.ink} /> : null}
      <Path d={D} fill={color.paper} />
    </Svg>
  );
}
