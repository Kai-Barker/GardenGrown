import { Tabs } from 'expo-router';
import CustomTabBar from '../../components/CustomTabBar';

/**
 * The signed-in tab navigator: Dashboard and Profile, rendered with the app's
 * custom bottom bar (which also holds the button that opens the garden).
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#A3C4A3', borderTopWidth: 0, elevation: 0 },
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
