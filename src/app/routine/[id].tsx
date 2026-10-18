import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoldToDeleteSheet, useFeedback } from '../../components/feedback';
import { Icon, IconName } from '../../components/Icon';
import { Button, Card, RoundButton } from '../../components/ui';
import { useData } from '../../db/useData';
import {
  activeWorkout,
  deleteRoutine,
  getPlanItems,
  getRoutine,
  movePlanItem,
  PlanItem,
  removePlanItem,
  renameRoutine,
  setRoutineDay,
  startWorkout,
  toggleSuperset,
  updatePlanItem,
  WEEKDAY_SHORT,
} from '../../db/queries';
import { resyncReminders } from '../../lib/notifications';
import { color, font, radius, size, space, type } from '../../theme';

export default function RoutineEditor() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const insets = useSafeAreaInsets();
  const routine = useData(() => getRoutine(id), [id]);
  const items = useData(() => getPlanItems(id), [id]);
  const [name, setName] = useState(routine?.name ?? '');
  const [open, setOpen] = useState<number | null>(null);
  const { sheet, toast } = useFeedback();

  useEffect(() => {
    if (routine) setName(routine.name);
    // Only on first load; afterwards the input owns the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id]);

  if (!routine) {
    return (
      <View style={{ flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Text style={type.body}>This routine was deleted.</Text>
        <Button label="Back" variant="surface" onPress={() => router.back()} />
      </View>
    );
  }

  const remove = () => {
    const name = routine.name;
    const n = items.length;
    sheet((close) => (
      <HoldToDeleteSheet
        title={`Delete ${name}?`}
        body={`This removes the routine${n ? ` and its ${n} ${n === 1 ? 'exercise' : 'exercises'}` : ''}. Workouts you've already done stay in History.`}
        onDelete={() => {
          close();
          router.back();
          const undo = deleteRoutine(id);
          resyncReminders();
          toast({
            title: `${name} deleted`,
            action: {
              label: 'Undo',
              onPress: () => {
                undo();
                resyncReminders();
              },
            },
          });
        }}
        close={close}
      />
    ));
  };

  const start = () => {
    const active = activeWorkout();
    const wid = active ? active.id : startWorkout(id);
    router.replace({ pathname: '/workout', params: { id: String(wid) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton icon="back" strokeWidth={2.4} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text style={type.pageLabel}>Edit routine</Text>
        <RoundButton icon="trash" accessibilityLabel="Delete routine" onPress={remove} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.gutter, paddingTop: space.stack, gap: space.stack, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={() => renameRoutine(id, name)}
          onBlur={() => renameRoutine(id, name)}
          placeholder="Routine name"
          placeholderTextColor={color.inkMuted}
          accessibilityLabel="Routine name"
          returnKeyType="done"
          style={{ ...type.title, fontSize: 40, lineHeight: 46, letterSpacing: -1.4, textAlign: 'center', paddingVertical: 4 }}
        />

        <View style={{ gap: 10, alignItems: 'center' }}>
          <Text style={type.caption}>{routine.weekday ? `Every ${WEEKDAY_SHORT[routine.weekday - 1]}` : 'No fixed day'}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {WEEKDAY_SHORT.map((d, i) => {
              const wd = i + 1;
              const on = routine.weekday === wd;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    setRoutineDay(id, on ? null : wd);
                    resyncReminders();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${d}${on ? ', selected' : ''}`}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? color.ink : color.surface,
                  }}
                >
                  <Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: on ? color.inkInverse : color.inkMuted }}>{d[0]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Card style={{ paddingVertical: 8 }}>
          {items.length === 0 ? (
            <Text style={[type.caption, { paddingVertical: 14 }]}>No exercises yet. Add the first one below.</Text>
          ) : null}
          {items.map((it, i) => (
            <ItemRow
              key={it.id}
              item={it}
              first={i === 0}
              last={i === items.length - 1}
              open={open === it.id}
              onToggle={() => setOpen(open === it.id ? null : it.id)}
              routineId={id}
            />
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/pick-exercise', params: { routineId: String(id) } })}
            accessibilityRole="button"
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderTopWidth: items.length ? 1 : 0, borderTopColor: color.line },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={{ width: 28, height: 28, borderRadius: 28, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={16} strokeWidth={2.6} />
            </View>
            <Text style={type.lead}>Add exercise</Text>
          </Pressable>
        </Card>

        {items.length ? <Button label={`Start ${routine.name}`} trailing="arrow" height={size.ctaH} onPress={start} /> : null}
      </ScrollView>
    </View>
  );
}

function ItemRow({
  item,
  first,
  last,
  open,
  onToggle,
  routineId,
}: {
  item: PlanItem;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  routineId: number;
}) {
  const { toast } = useFeedback();
  const rest = item.restSec >= 60 ? `${Math.floor(item.restSec / 60)}:${String(item.restSec % 60).padStart(2, '0')}` : `${item.restSec}s`;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: color.line }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 }, pressed && { opacity: 0.6 }]}
      >
        {item.superset != null ? <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color.ink }} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={type.lead}>{item.name}</Text>
          <Text style={type.caption}>
            {item.sets} × {item.repMin}–{item.repMax} · rest {rest}
            {item.superset != null ? ' · superset' : ''}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={18} color={color.inkMuted} strokeWidth={2.2} />
        </View>
      </Pressable>

      {open ? (
        <View style={{ gap: 10, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Mini label="Sets" value={String(item.sets)} onMinus={() => updatePlanItem(item.id, { sets: item.sets - 1 })} onPlus={() => updatePlanItem(item.id, { sets: item.sets + 1 })} />
            <Mini label="Rest" value={rest} onMinus={() => updatePlanItem(item.id, { restSec: item.restSec - 15 })} onPlus={() => updatePlanItem(item.id, { restSec: item.restSec + 15 })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Mini label="Min reps" value={String(item.repMin)} onMinus={() => updatePlanItem(item.id, { repMin: item.repMin - 1 })} onPlus={() => updatePlanItem(item.id, { repMin: item.repMin + 1 })} />
            <Mini label="Max reps" value={String(item.repMax)} onMinus={() => updatePlanItem(item.id, { repMax: item.repMax - 1 })} onPlus={() => updatePlanItem(item.id, { repMax: item.repMax + 1 })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Action icon="send" label="Up" disabled={first} onPress={() => movePlanItem(routineId, item.id, -1)} />
            <Action icon="send" flip label="Down" disabled={last} onPress={() => movePlanItem(routineId, item.id, 1)} />
            <Action
              icon="plus"
              label={item.superset != null ? 'Unpair' : 'Superset'}
              disabled={item.superset == null && last}
              onPress={() => toggleSuperset(routineId, item.id)}
            />
            <Action
              icon="trash"
              label="Remove"
              onPress={() => {
                const undo = removePlanItem(item.id);
                toast({ title: `${item.name} removed`, action: { label: 'Undo', onPress: undo } });
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Mini({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: color.paper,
      }}
    >
      <Pressable
        onPress={onMinus}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label.toLowerCase()}`}
        style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 40, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
      >
        <Icon name="minus" size={16} strokeWidth={2.4} />
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={[type.stat, { fontSize: 18, lineHeight: 22 }]}>{value}</Text>
        <Text style={[type.caption, { fontSize: 11, lineHeight: 13 }]}>{label}</Text>
      </View>
      <Pressable
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label.toLowerCase()}`}
        style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 40, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
      >
        <Icon name="plus" size={16} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
  flip,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  flip?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: 40,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: color.lineStrong,
        },
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.3 },
      ]}
    >
      <View style={flip ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <Icon name={icon} size={14} strokeWidth={2.4} />
      </View>
      <Text style={[type.body, { fontFamily: font.sansSemi, fontSize: 14 }]}>{label}</Text>
    </Pressable>
  );
}
