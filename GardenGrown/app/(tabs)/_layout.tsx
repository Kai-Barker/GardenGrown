import { Tabs } from 'expo-router';
import { View, Pressable, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

function CustomTabBar({ state, navigation }: any) {
  const router = useRouter();
  
  // Find which real tab is active (0 = dashboard, 1 = profile)
  const activeRouteName = state.routes[state.index].name;

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
          onPress={() => navigation.navigate('dashboard')}
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
          className="flex-1 items-center justify-center h-full"
        >
          <MaterialCommunityIcons name="tree-outline" size={36} color="#4A4A4A" />
        </Pressable>
        <View className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-12 bg-[#E1D4BA] rounded-full" />
      </View>

      {/* 3. PROFILE TAB */}
      <View className="flex-row items-center flex-1">
        <Pressable
          onPress={() => navigation.navigate('profile')}
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