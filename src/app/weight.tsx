import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useFeedback } from '../components/feedback';
import { Button, Stepper } from '../components/ui';
import { logWeight, weightSummary } from '../db/queries';
import { fmtKg } from '../lib/format';
import { color, size, space, type } from '../theme';

export default function Weight() {
  const { toast } = useFeedback();
  const [kg, setKg] = useState(() => weightSummary()?.latest ?? 68);
  const step = (d: number) => setKg((k) => Math.round((k + d) * 10) / 10);
  return (
    <View style={{ flex: 1, backgroundColor: color.paper, padding: space.gutter, paddingTop: 28, gap: space.stack }}>
      <Text style={[type.pageLabel, { textAlign: 'center' }]}>Morning weight</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
        <Text style={type.hero}>{fmtKg(kg)}</Text>
        <Text style={[type.stat, { fontSize: 28, color: color.inkMuted }]}>kg</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stepper label="0.1" onMinus={() => step(-0.1)} onPlus={() => step(0.1)} />
        <Stepper label="1 kg" onMinus={() => step(-1)} onPlus={() => step(1)} />
      </View>
      <Button
        label="Save"
        trailing="check"
        height={size.ctaH}
        onPress={() => {
          logWeight(kg);
          router.back();
          toast({ title: 'Weight logged', detail: `${fmtKg(kg)} kg this morning` });
        }}
      />
    </View>
  );
}
