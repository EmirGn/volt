// Small actions shared by several screens that confirm themselves with a toast.
import { deleteFood, Habit, Meal, MEALS, toggleHabit } from '../db/queries';
import { fmtInt } from '../lib/format';
import { resyncHabitNudge } from '../lib/notifications';
import { useFeedback } from './feedback';

export function useTickHabit() {
  const { toast } = useFeedback();
  return (h: Habit, all: Habit[]) => {
    const done = toggleHabit(h.id);
    resyncHabitNudge();
    if (!done) return;
    const same = all.filter((x) => x.kind === h.kind);
    const n = same.filter((x) => x.done).length + 1;
    toast({
      title: `${h.title} ticked`,
      detail: `${n} of ${same.length} ${h.kind === 'supplement' ? 'supplements' : 'tasks'} today`,
      action: {
        label: 'Undo',
        onPress: () => {
          toggleHabit(h.id);
          resyncHabitNudge();
        },
      },
    });
  };
}

export function useFoodToasts() {
  const { toast } = useFeedback();
  return {
    added: (id: number, meal: Meal, kcal: number) =>
      toast({
        title: `Added to ${MEALS.find((m) => m.id === meal)?.label.toLowerCase() ?? meal}`,
        detail: `${fmtInt(kcal)} kcal`,
        action: { label: 'Undo', onPress: () => deleteFood(id) },
      }),
    removed: (id: number, name: string) => {
      const undo = deleteFood(id);
      toast({ title: `${name} removed`, action: { label: 'Undo', onPress: undo } });
    },
  };
}
