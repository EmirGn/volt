import { useEffect, useState } from 'react';
import { ErrorBoundaryProps, router, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { ErrorScreen } from '../components/ErrorScreen';
import { FeedbackProvider } from '../components/feedback';
import { Opening } from '../components/Opening';
import { migrate } from '../db/db';
import { resyncHabitNudge, resyncReminders, shouldAskForNotifications } from '../lib/notifications';
import { color } from '../theme';

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} label="Volt" />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });
  const [dbReady, setDbReady] = useState(false);
  const [opening, setOpening] = useState(true);

  useEffect(() => {
    migrate();
    setDbReady(true);
  }, []);

  const ready = fontsLoaded && dbReady;
  useEffect(() => {
    // The opening's ink curtain matches the native splash, so the handoff is invisible.
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const opened = () => {
    setOpening(false);
    resyncReminders();
    resyncHabitNudge();
    shouldAskForNotifications().then((ask) => ask && router.push('/notifications'));
  };

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <FeedbackProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="add-food" options={{ presentation: 'modal' }} />
          <Stack.Screen name="routine/[id]" />
          <Stack.Screen name="history/index" />
          <Stack.Screen name="history/[id]" />
          <Stack.Screen name="exercise/[id]" />
          <Stack.Screen name="pick-exercise" options={{ presentation: 'modal' }} />
          <Stack.Screen name="weight" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5], sheetGrabberVisible: true }} />
          <Stack.Screen name="notifications" options={{ presentation: 'fullScreenModal' }} />
        </Stack>
        {opening ? <Opening onDone={opened} /> : null}
      </FeedbackProvider>
    </SafeAreaProvider>
  );
}
