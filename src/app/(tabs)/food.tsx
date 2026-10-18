import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useFoodToasts, useTickHabit } from '../../components/actions';
import { Icon } from '../../components/Icon';
import { Card, CheckRow, EmptyNote, Header, HeroNumber, Row, Rows, Screen, Segmented, SmallButton } from '../../components/ui';
import { useData } from '../../db/useData';
import {
  addPreset,
  foodForDay,
  getTargets,
  habitsForDay,
  mealForNow,
  MEALS,
  presets,
  totalsFor,
} from '../../db/queries';
import { fmtInt } from '../../lib/format';
import { color, font, radius, type } from '../../theme';

type Tab = 'meals' | 'supps' | 'recent';

export default function Food() {
  const [tab, setTab] = useState<Tab>('meals');
  const [search, setSearch] = useState('');
  const targets = useData(getTargets);
  const food = useData(() => foodForDay());
  const totals = totalsFor(food);
  const left = targets.kcal - totals.kcal;

  return (
    <Screen>
      <Header label="Food · Today" icon="plus" accessibilityLabel="Add food" onPress={() => router.push('/add-food')} />
      <HeroNumber
        value={fmtInt(totals.kcal)}
        caption={`kcal eaten · ${fmtInt(Math.abs(left))} ${left >= 0 ? 'left' : 'over'} of ${fmtInt(targets.kcal)}`}
      >
        <View
          style={{
            flex: 1,
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
            onChangeText={(t) => {
              setSearch(t);
              if (t) setTab('recent');
            }}
            placeholder="Search food"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel="Search food"
            returnKeyType="search"
            style={{ flex: 1, fontFamily: font.sansMedium, fontSize: 15, color: color.ink, paddingVertical: 12 }}
          />
        </View>
      </HeroNumber>
      <Segmented
        options={[
          { id: 'meals', label: 'Meals' },
          { id: 'supps', label: 'Supplements' },
          { id: 'recent', label: 'Recent' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'meals' ? <MealsCard /> : null}
      {tab === 'supps' ? <SuppsCard /> : null}
      {tab === 'recent' ? <RecentCard search={search} /> : null}
    </Screen>
  );
}

function MealsCard() {
  const food = useData(() => foodForDay());
  const foodToasts = useFoodToasts();
  const firstEmpty = MEALS.find((m) => !food.some((f) => f.meal === m.id))?.id;
  return (
    <Card rows>
      <Rows>
        {MEALS.map((m) => {
          const entries = food.filter((f) => f.meal === m.id);
          const kcal = entries.reduce((s, e) => s + e.kcal, 0);
          if (!entries.length) {
            return (
              <Row
                key={m.id}
                title={m.label}
                titleStyle={{ fontFamily: font.sansSemi, fontSize: 16 }}
                minHeight={60}
                right={<SmallButton label="Add" volt={m.id === firstEmpty} onPress={() => router.push({ pathname: '/add-food', params: { meal: m.id } })} />}
              />
            );
          }
          return (
            <Pressable
              key={m.id}
              onPress={() => router.push({ pathname: '/add-food', params: { meal: m.id } })}
              accessibilityRole="button"
              accessibilityHint="Add more to this meal"
              style={({ pressed }) => [{ paddingVertical: 12, gap: 4 }, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={type.lead}>{m.label}</Text>
                <Text style={[type.body, { fontFamily: font.sansSemi }]}>{fmtInt(kcal)}</Text>
              </View>
              {entries.map((e) => (
                <Pressable
                  key={e.id}
                  onLongPress={() => foodToasts.removed(e.id, e.name)}
                  accessibilityHint="Long press to remove"
                >
                  <Text style={type.caption}>
                    {e.name} {fmtInt(e.kcal)} · P {Math.round(e.protein)}
                  </Text>
                </Pressable>
              ))}
            </Pressable>
          );
        })}
      </Rows>
    </Card>
  );
}

function SuppsCard() {
  const supps = useData(() => habitsForDay(undefined, 'supplement'));
  const taken = supps.filter((s) => s.done).length;
  const tick = useTickHabit();
  return (
    <Card rows>
      <Rows>
        {supps.map((s) => (
          <CheckRow key={s.id} label={s.title} meta={s.streak > 1 ? `${s.dose} · ${s.streak} days` : s.dose} done={s.done} onToggle={() => tick(s, supps)} />
        ))}
      </Rows>
      <Text style={[type.caption, { paddingVertical: 14 }]}>
        {taken} of {supps.length} taken today
      </Text>
    </Card>
  );
}

function RecentCard({ search }: { search: string }) {
  const list = useData(() => presets(search), [search]);
  const food = useFoodToasts();
  if (!list.length) {
    return (
      <Card rows>
        <EmptyNote>{`Nothing saved called "${search}". Add it with the + button.`}</EmptyNote>
      </Card>
    );
  }
  return (
    <Card rows>
      <Rows>
        {list.map((p) => (
          <Row
            key={p.id}
            title={p.name}
            subtitle={`${p.detail ? p.detail + ' · ' : ''}${fmtInt(p.kcal)} kcal · P ${Math.round(p.protein)}`}
            minHeight={60}
            right={
              <Pressable
                onPress={() => {
                  const meal = mealForNow();
                  food.added(addPreset(p, meal), meal, p.kcal);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${p.name}`}
                style={({ pressed }) => [
                  { width: 40, height: 40, borderRadius: 40, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Icon name="plus" size={18} strokeWidth={2.4} />
              </Pressable>
            }
          />
        ))}
      </Rows>
    </Card>
  );
}
