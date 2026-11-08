import { Tabs } from 'expo-router';
import CustomTabBar from '../../components/CustomTabBar';

// Update the actual Tabs layout to only include Dashboard and Profile
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
