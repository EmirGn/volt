// Volt only notifies for two things: a rest timer ending while the app is in the background,
// and a planned workout starting in 15 minutes. Everything else stays in the app's own toasts.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getPlanItems, getRoutines, getSetting, setSetting, workoutTime } from '../db/queries';

const CHANNEL = 'volt';
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
  if (p.granted) await syncWorkoutReminders();
  return p.granted;
}

export async function scheduleRestEnd(seconds: number, body: string) {
  await cancelRestEnd();
  if (seconds < 5 || !(await granted())) return;
  await ensureChannel();
  restId = await Notifications.scheduleNotificationAsync({
    content: { title: "Rest's over", body, data: { kind: 'rest' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL },
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
