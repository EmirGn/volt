import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedback } from '../components/feedback';
import { Icon } from '../components/Icon';
import { Button, Card, RoundButton, Row, Rows, Segmented } from '../components/ui';
import { useData } from '../db/useData';
import { addFood, addPreset, deleteFood, foodForDay, getTargets, Meal, mealForNow, MEALS, Preset, presets, savePreset, totalsFor } from '../db/queries';
import { fmtInt } from '../lib/format';
import { color, font, radius, size, space, type } from '../theme';

const PORTIONS = [0.5, 1, 1.5, 2];
const portionLabel = (f: number) => (f === 0.5 ? '½' : f === 1.5 ? '1½' : `${f}`);

/**
 * Log food stays open: each tap adds one portion and counts up on the row, so a whole meal is a few taps.
 * Hold a row to pick a portion first. Done closes it.
 */
export default function AddFood() {
  const params = useLocalSearchParams<{ meal?: Meal }>();
  const insets = useSafeAreaInsets();
  const { toast } = useFeedback();
  const [meal, setMeal] = useState<Meal>(params.meal ?? mealForNow());
  const [search, setSearch] = useState('');
  const list = useData(() => presets(search.trim()), [search]);
  const targets = useData(getTargets);
  const totals = totalsFor(useData(() => foodForDay()));
  const left = targets.kcal - totals.kcal;
  // Entries added in this sheet, per preset, so the row shows ×2 and Undo can count back down.
  const [added, setAdded] = useState<Record<number, number[]>>({});
  const [portionFor, setPortionFor] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [save, setSave] = useState(true);

  const kcalNum = Number(kcal.replace(',', '.'));
  const canAdd = name.trim().length > 0 && kcalNum > 0;
  const num = (s: string) => Number(s.replace(',', '.')) || 0;
  const mealLabel = MEALS.find((m) => m.id === meal)?.label.toLowerCase() ?? meal;

  const addOne = (p: Preset, portion = 1) => {
    const id =
      portion === 1
        ? addPreset(p, meal)
        : addFood({
            meal,
            name: `${p.name} ×${portionLabel(portion)}`,
            kcal: p.kcal * portion,
            protein: p.protein * portion,
            carbs: p.carbs * portion,
            fat: p.fat * portion,
          });
    setAdded((a) => ({ ...a, [p.id]: [...(a[p.id] ?? []), id] }));
    setPortionFor(null);
    const count = (added[p.id]?.length ?? 0) + 1;
    toast({
      title: `${p.name}${count > 1 ? ` ×${count}` : ''} added to ${mealLabel}`,
      detail: `${fmtInt(p.kcal * portion)} kcal`,
      action: {
        label: 'Undo',
        onPress: () => {
          deleteFood(id);
          setAdded((a) => ({ ...a, [p.id]: (a[p.id] ?? []).filter((x) => x !== id) }));
        },
      },
    });
  };

  const addCustom = () => {
    if (!canAdd) return;
    const f = { name: name.trim(), kcal: kcalNum, protein: num(protein), carbs: num(carbs), fat: num(fat) };
    const id = addFood({ meal, ...f });
    if (save) savePreset({ ...f, detail: '' });
    setName('');
    setKcal('');
    setProtein('');
    setCarbs('');
    setFat('');
    toast({ title: `Added to ${mealLabel}`, detail: `${fmtInt(f.kcal)} kcal`, action: { label: 'Undo', onPress: () => deleteFood(id) } });
  };

  const shown = search.trim() ? list : list.slice(0, 8);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: 20, gap: space.stack, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text style={type.title}>Log food</Text>
          <RoundButton icon="close" accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
        <Segmented options={MEALS} value={meal} onChange={setMeal} />

        <Card rows>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 10, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: color.paper }}>
            <Icon name="search" size={18} color={color.inkMuted} strokeWidth={2.2} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search your foods"
              placeholderTextColor={color.inkMuted}
              accessibilityLabel="Search your foods"
              returnKeyType="search"
              style={{ flex: 1, fontFamily: font.sansMedium, fontSize: 15, color: color.ink, paddingVertical: 10 }}
            />
          </View>
          <Text style={[type.caption, { paddingTop: 10, paddingBottom: 2 }]}>Tap to add one. Hold for a portion.</Text>
          <Rows>
            {shown.map((p) => {
              const n = added[p.id]?.length ?? 0;
              return (
                <View key={p.id}>
                  <Pressable
                    onPress={() => addOne(p)}
                    onLongPress={() => setPortionFor(portionFor === p.id ? null : p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${p.name}, ${fmtInt(p.kcal)} kcal${n ? `, added ${n}` : ''}`}
                    accessibilityHint="Long press to pick a portion"
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }, pressed && { opacity: 0.6 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontFamily: font.sansSemi }]}>{p.name}</Text>
                      <Text style={type.caption}>
                        {fmtInt(p.kcal)} kcal · P {Math.round(p.protein)} · C {Math.round(p.carbs)} · F {Math.round(p.fat)}
                      </Text>
                    </View>
                    {n ? (
                      <View style={{ minWidth: 40, height: 32, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[type.caption, { color: color.inkInverse, fontFamily: font.sansBold }]}>×{n}</Text>
                      </View>
                    ) : (
                      <Icon name="plus" size={18} strokeWidth={2.4} />
                    )}
                  </Pressable>
                  {portionFor === p.id ? (
                    <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 12 }}>
                      {PORTIONS.map((f) => (
                        <Pressable
                          key={f}
                          onPress={() => addOne(p, f)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${portionLabel(f)} portion, ${fmtInt(p.kcal * f)} kcal`}
                          style={({ pressed }) => [
                            { flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <Text style={[type.body, { fontFamily: font.sansSemi }]}>×{portionLabel(f)}</Text>
                          <Text style={[type.caption, { fontSize: 11 }]}>{fmtInt(p.kcal * f)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {!shown.length ? <Row title={`Nothing saved called "${search.trim()}"`} subtitle="Add it below and it's saved for next time" /> : null}
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
          <Button label="Add to log" variant={canAdd ? 'volt' : 'surface'} disabled={!canAdd} onPress={addCustom} />
        </Card>
      </ScrollView>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: Math.max(20, insets.bottom), backgroundColor: color.paper }}>
        <Button
          label={`Done · ${fmtInt(Math.abs(left))} kcal ${left >= 0 ? 'left' : 'over'}`}
          height={size.ctaH}
          onPress={() => router.back()}
        />
      </View>
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
