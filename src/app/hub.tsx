import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { connectHub } from '../sync/sync';
import { color, space, type } from '../theme';

/** Opened by the volt://hub?url=…&token=… link that `volt connect` shows as a QR code on the Mac. */
export default function ConnectHub() {
  const insets = useSafeAreaInsets();
  const { url, token } = useLocalSearchParams<{ url?: string; token?: string }>();
  const [state, setState] = useState<'connecting' | 'done' | 'failed'>('connecting');
  const [error, setError] = useState('');

  useEffect(() => {
    connectHub(url ?? '', token ?? '')
      .then((ok) => {
        setState(ok ? 'done' : 'failed');
        if (!ok) setError('The hub didn’t answer. It will keep trying in the background.');
      })
      .catch((e: unknown) => {
        setState('failed');
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [url, token]);

  const big = { connecting: '…', done: 'Synced', failed: 'Hm.' }[state];
  const caption = {
    connecting: 'Connecting to your hub',
    done: 'This phone and Claude now share one copy of your training.',
    failed: error,
  }[state];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.paper,
        paddingTop: insets.top + space.screenTop,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: space.gutter,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ gap: 12, marginTop: 80 }}>
        <Text style={[type.hero, { fontSize: 72, lineHeight: 72, letterSpacing: -3 }]} accessibilityRole="header">
          {big}
        </Text>
        <Text style={type.body}>{caption}</Text>
      </View>
      <Button label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} disabled={state === 'connecting'} />
    </View>
  );
}
