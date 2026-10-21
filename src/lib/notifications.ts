// Volt only notifies for three things: a rest timer ending while the app is in the background,
// a planned workout starting in 15 minutes, and tasks still open at 21:30.
// Everything else stays in the app's own toasts.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dayKey, getPlanItems, getRoutines, getSetting, habitsForDay, setSetting, workoutTime } from '../db/queries';

const CHANNEL = 'volt';
// Android fixes a channel's sound when it's created, so the countdown gets a channel of its own.
const REST_CHANNEL = 'volt-rest';
/** Bip at 0, 1 and 2 s, then a long beep at 3 s. Bundled by the expo-notifications plugin. */
export const REST_SOUND = 'rest_countdown.wav';
export const COUNTDOWN_MS = 3000;
let restId: string | null = null;
let workoutOpen = false;

/** While the workout screen is open its own toast announces the end of a rest, so the banner stays quiet. */
export function setWorkoutOpen(open: boolean) {
  workoutOpen = open;
}

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const quiet = workoutOpen && n.request.content.data?.kind === 'rest';
    return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
  },
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Rest timer and workout reminders',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#CCF547',
  });
  await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
    name: 'Rest countdown',
    importance: Notifications.AndroidImportance.HIGH,
    sound: REST_SOUND,
    lightColor: '#CCF547',
  });
}

async function granted() {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** True the first time, while the system prompt hasn't been shown and the user hasn't skipped ours. */
export async function shouldAskForNotifications() {
  if (getSetting('notifications_asked')) return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return !p.granted && p.canAskAgain;
  } catch {
    return false;
  }
}

export function markNotificationsAsked() {
  setSetting('notifications_asked', '1');
}

export async function requestNotifications() {
  markNotificationsAsked();
  await ensureChannel();
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) {
    await syncWorkoutReminders();
    await syncHabitNudge();
  }
  return p.granted;
}

/**
 * Fires 3 s before the rest ends. Its sound is the countdown, so the long beep lands when rest is over,
 * even with Volt in the background. With the workout open, the screen plays the same sound itself.
 */
export async function scheduleRestEnd(seconds: number, body: string) {
  await cancelRestEnd();
  if (seconds < 5 || !(await granted())) return;
  await ensureChannel();
  restId = await Notifications.scheduleNotificationAsync({
    content: { title: "Rest's over", body, sound: REST_SOUND, data: { kind: 'rest' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: seconds - COUNTDOWN_MS / 1000,
      channelId: REST_CHANNEL,
    },
  });
}

export async function cancelRestEnd() {
  if (!restId) return;
  const id = restId;
  restId = null;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Re-creates one weekly reminder per scheduled routine. Call after the plan changes. */
export async function syncWorkoutReminders() {
  if (!(await granted())) return;
  await ensureChannel();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.kind === 'reminder')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const [h, m] = workoutTime().split(':').map(Number);
  const at = h * 60 + m - 15;
  for (const r of getRoutines()) {
    if (r.weekday == null) continue;
    // Reminders that would fall before midnight go out the day before.
    const dayShift = at < 0 ? -1 : 0;
    const minutes = (at + 1440) % 1440;
    const iso = ((r.weekday - 1 + dayShift + 7) % 7) + 1; // 1 = Monday … 7 = Sunday
    const items = getPlanItems(r.id);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${r.name} in 15 minutes`,
        body: `${items.length} exercises${items[0] ? ` · starts with ${items[0].name.toLowerCase()}` : ''}`,
        data: { kind: 'reminder', routineId: r.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: (iso % 7) + 1, // expo-notifications counts 1 = Sunday
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        channelId: CHANNEL,
      },
    });
  }
}

/** Fire-and-forget wrapper so plan edits never wait on, or fail because of, notifications. */
export function resyncReminders() {
  syncWorkoutReminders().catch(() => {});
}

// ---------- 21:30 open tasks ----------

const NUDGE_HOUR = 21;
const NUDGE_MINUTE = 30;

export function habitNudgeOn() {
  return getSetting('habit_nudge') !== '0';
}

const listNames = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * One reminder at 21:30 naming what's still unticked. It's a one-off that is rescheduled on every tick and
 * every launch, so its text is current: tonight if something is open, otherwise tomorrow night.
 */
export async function syncHabitNudge() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.kind === 'habits')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!habitNudgeOn() || !(await granted())) return;
  await ensureChannel();
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), NUDGE_HOUR, NUDGE_MINUTE);
  let open = habitsForDay().filter((h) => !h.done);
  if (now >= at || !open.length) {
    at.setDate(at.getDate() + 1);
    open = habitsForDay(dayKey(at)).filter((h) => !h.done);
  }
  if (!open.length) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${open.length} ${open.length === 1 ? 'task' : 'tasks'} open`,
      body: `${listNames(open.map((h) => (h.dose ? `${h.title} ${h.dose}` : h.title)))} left today.`,
      data: { kind: 'habits' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
  });
}

export function resyncHabitNudge() {
  syncHabitNudge().catch(() => {});
}

export async function setHabitNudge(on: boolean) {
  setSetting('habit_nudge', on ? '1' : '0');
  if (on && !(await granted())) await requestNotifications();
  await syncHabitNudge();
}
