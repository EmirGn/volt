import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../components/Icon';
import { Card, RoundButton } from '../components/ui';
import { useData } from '../db/useData';
import { addToRoutine, createExercise, getPlanItems, listExercises } from '../db/queries';
import { color, font, radius, space, type } from '../theme';

export default function PickExercise() {
  const { routineId: rid } = useLocalSearchParams<{ routineId: string }>();
  const routineId = Number(rid);
  const [search, setSearch] = useState('');
  const list = useData(() => listExercises(search.trim()), [search]);
  const inRoutine = useData(() => new Set(getPlanItems(routineId).map((i) => i.exerciseId)), [routineId]);
  const exact = list.some((e) => e.name.toLowerCase() === search.trim().toLowerCase());

  const pick = (exerciseId: number) => {
    addToRoutine(routineId, exerciseId);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: 20, gap: space.stack, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text style={type.title}>Add exercise</Text>
          <RoundButton icon="close" accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 52,
            paddingHorizontal: 18,
            borderRadius: radius.pill,
            backgroundColor: color.surface,
          }}
        >
          <Icon name="search" size={20} color={color.inkMuted} strokeWidth={2.2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search or type a new exercise"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel="Search exercises"
            autoFocus
            returnKeyType="done"
            style={{ flex: 1, fontFamily: font.sansMedium, fontSize: 15, color: color.ink, paddingVertical: 12 }}
          />
        </View>

        <Card style={{ paddingVertical: 8 }}>
          {search.trim() && !exact ? (
            <Pressable
              onPress={() => pick(createExercise(search))}
              accessibilityRole="button"
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }, pressed && { opacity: 0.6 }]}
            >
              <View style={{ width: 28, height: 28, borderRadius: 28, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={16} strokeWidth={2.6} />
              </View>
              <Text style={[type.lead, { flex: 1 }]}>Create “{search.trim()}”</Text>
            </Pressable>
          ) : null}
          {list.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => pick(e.id)}
              accessibilityRole="button"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 56,
                  borderTopWidth: i === 0 && !(search.trim() && !exact) ? 0 : 1,
                  borderTopColor: color.line,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[type.body, { flex: 1, fontFamily: font.sansSemi }]}>{e.name}</Text>
              {inRoutine.has(e.id) ? <Text style={type.caption}>In routine</Text> : <Icon name="plus" size={18} strokeWidth={2.4} />}
            </Pressable>
          ))}
          {!list.length && !search.trim() ? <Text style={[type.caption, { paddingVertical: 14 }]}>No exercises yet.</Text> : null}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
