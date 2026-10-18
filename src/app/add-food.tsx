import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFoodToasts } from '../components/actions';
import { Icon } from '../components/Icon';
import { Button, Card, RoundButton, Row, Rows, Segmented } from '../components/ui';
import { useData } from '../db/useData';
import { addFood, addPreset, Meal, mealForNow, MEALS, presets, savePreset } from '../db/queries';
import { fmtInt } from '../lib/format';
import { color, font, radius, space, type } from '../theme';

export default function AddFood() {
  const params = useLocalSearchParams<{ meal?: Meal }>();
  const [meal, setMeal] = useState<Meal>(params.meal ?? mealForNow());
  const list = useData(() => presets());
  const food = useFoodToasts();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [save, setSave] = useState(true);

  const kcalNum = Number(kcal.replace(',', '.'));
  const canAdd = name.trim().length > 0 && kcalNum > 0;
  const num = (s: string) => Number(s.replace(',', '.')) || 0;

  const add = () => {
    if (!canAdd) return;
    const f = { name: name.trim(), kcal: kcalNum, protein: num(protein), carbs: num(carbs), fat: num(fat) };
    const id = addFood({ meal, ...f });
    if (save) savePreset({ ...f, detail: '' });
    router.back();
    food.added(id, meal, f.kcal);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: 20, gap: space.stack, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text style={type.title}>Log food</Text>
          <RoundButton icon="close" accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
        <Segmented options={MEALS} value={meal} onChange={setMeal} />

        <Card rows>
          <Text style={[type.label, { paddingTop: 12, paddingBottom: 4 }]}>Quick add</Text>
          <Rows>
            {list.slice(0, 6).map((p) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={`${fmtInt(p.kcal)} kcal · P ${Math.round(p.protein)} · C ${Math.round(p.carbs)} · F ${Math.round(p.fat)}`}
                minHeight={60}
                onPress={() => {
                  const id = addPreset(p, meal);
                  router.back();
                  food.added(id, meal, p.kcal);
                }}
                right={<Icon name="plus" size={18} strokeWidth={2.4} />}
              />
            ))}
          </Rows>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={type.label}>Something else</Text>
          <Field label="Name" value={name} onChange={setName} placeholder="Chicken wrap" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="kcal" value={kcal} onChange={setKcal} placeholder="0" numeric />
            <Field label="Protein g" value={protein} onChange={setProtein} placeholder="0" numeric />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Carbs g" value={carbs} onChange={setCarbs} placeholder="0" numeric />
            <Field label="Fat g" value={fat} onChange={setFat} placeholder="0" numeric />
          </View>
          <Pressable
            onPress={() => setSave(!save)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: save }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 22,
                borderWidth: save ? 0 : 2,
                borderColor: color.lineStrong,
                backgroundColor: save ? color.ink : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {save ? <Icon name="check" size={13} strokeWidth={3} color={color.inkInverse} /> : null}
            </View>
            <Text style={type.body}>Save for quick add</Text>
          </Pressable>
          <Button label="Add to log" variant={canAdd ? 'volt' : 'surface'} disabled={!canAdd} onPress={add} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={type.caption}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.inkMuted}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        accessibilityLabel={label}
        style={{
          minHeight: 48,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: color.paper,
          fontFamily: font.sansMedium,
          fontSize: 16,
          color: color.ink,
        }}
      />
    </View>
  );
}
