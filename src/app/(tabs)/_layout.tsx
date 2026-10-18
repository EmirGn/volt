import { Pressable, View } from 'react-native';
import { router, Slot, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../components/Icon';
import { color, radius, size } from '../../theme';

const ITEMS: { href: '/' | '/train' | '/food' | '/coach' | '/progress'; icon: IconName; label: string }[] = [
  { href: '/', icon: 'home', label: 'Today' },
  { href: '/train', icon: 'dumbbell', label: 'Train' },
  { href: '/food', icon: 'bowl', label: 'Food' },
  { href: '/coach', icon: 'chat', label: 'Coach' },
  { href: '/progress', icon: 'chart', label: 'Progress' },
];

export default function TabsLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <Slot />
      <View
        accessibilityRole="tablist"
        style={{
          position: 'absolute',
          alignSelf: 'center',
          bottom: Math.max(26, insets.bottom),
          flexDirection: 'row',
          gap: 4,
          padding: 7,
          borderRadius: radius.pill,
          backgroundColor: color.ink,
        }}
      >
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (active) return;
                router.replace(item.href);
              }}
              style={{
                width: size.dockItem,
                height: size.dockItem,
                borderRadius: size.dockItem,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? color.volt : 'transparent',
              }}
            >
              <Icon name={item.icon} size={22} strokeWidth={active ? 2.2 : 2} color={active ? color.ink : color.inkSubtle} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
