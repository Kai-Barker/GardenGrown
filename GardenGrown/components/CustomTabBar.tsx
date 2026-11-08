import { Tabs, useRouter } from 'expo-router';
import { View, Pressable, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';

// Props expo-router passes to a custom tab bar. As of expo-router 58 there is no
// `navigation` prop — tabs are switched with `navigateToTab(route.key)`.
export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * The app's bottom bar: Dashboard and Profile are real tabs, and the tree in the
 * middle pushes the garden screen on top of them.
 *
 * Lives outside app/ so tests can import it — route files should only export
 * their screen.
 */
export default function CustomTabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const router = useRouter();

  // Find which real tab is active (0 = dashboard, 1 = profile)
  const activeRouteName = state.routes[state.index].name;

  // Switch to a tab by route name, mirroring the built-in tab bar: emit `tabPress`
  // (so screens can listen/prevent it), then navigate using the route's key.
  const goToTab = (name: string) => {
    const index = state.routes.findIndex((r) => r.name === name);
    if (index === -1) return;
    const route = state.routes[index];
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (index !== state.index && !event.defaultPrevented) navigateToTab(route.key);
  };

  return (
    <View
      className="flex-row items-center justify-around bg-[#A1BEA4] w-full shadow-lg"
      style={{
        height: Platform.OS === 'ios' ? 90 : 80,
        paddingBottom: Platform.OS === 'ios' ? 20 : 0
      }}
    >
      {/* 1. DASHBOARD TAB */}
      <View className="flex-row items-center flex-1">
        <Pressable
          onPress={() => goToTab('dashboard')}
          accessibilityRole="button"
          accessibilityLabel="Dashboard"
          className="flex-1 items-center justify-center h-full"
        >
          <Feather
            name="home"
            size={32}
            color={activeRouteName === 'dashboard' ? '#2A2A2A' : '#4A4A4A'}
          />
        </Pressable>
        <View className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-12 bg-[#E1D4BA] rounded-full" />
      </View>

      {/* 2. GARDEN STACK BUTTON */}
      <View className="flex-row items-center flex-1">
        <Pressable
          onPress={() => router.push('/garden')}
          accessibilityRole="button"
          accessibilityLabel="Garden"
          className="flex-1 items-center justify-center h-full"
        >
          <MaterialCommunityIcons name="tree-outline" size={36} color="#4A4A4A" />
        </Pressable>
        <View className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-12 bg-[#E1D4BA] rounded-full" />
      </View>

      {/* 3. PROFILE TAB */}
      <View className="flex-row items-center flex-1">
        <Pressable
          onPress={() => goToTab('profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          className="flex-1 items-center justify-center h-full"
        >
          <Feather
            name="user"
            size={32}
            color={activeRouteName === 'profile' ? '#2A2A2A' : '#4A4A4A'}
          />
        </Pressable>
      </View>
    </View>
  );
}
