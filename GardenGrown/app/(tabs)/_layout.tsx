import { Tabs } from 'expo-router';
import { View, Pressable, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';


function CustomTabBar({ state, descriptors, navigation }: any) {
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key].options;

  // If the active screen has 'display: none', don't render the tab bar at all
  if (focusedOptions?.tabBarStyle?.display === 'none') {
    return null;
  }
  return (
    <View
      className="flex-row items-center justify-around bg-[#A1BEA4] w-full shadow-lg"
      style={{
        height: Platform.OS === 'ios' ? 90 : 80, // Taller on iOS to account for the home swipe indicator
        paddingBottom: Platform.OS === 'ios' ? 20 : 0
      }}
    >
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;

        // Navigate to the screen when pressed
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Determine which icon to show based on the file name
        let IconComponent;
        if (route.name === 'dashboard') {
          IconComponent = <Feather name="home" size={32} color="#4A4A4A" />;
        } else if (route.name === 'garden') {
          // MaterialCommunityIcons has a great tree outline
          IconComponent = <MaterialCommunityIcons name="tree-outline" size={36} color="#4A4A4A" />;
        } else if (route.name === 'profile') {
          IconComponent = <Feather name="user" size={32} color="#4A4A4A" />;
        }

        return (
          <View key={route.key} className="flex-row items-center flex-1">

            {/* The Tab Icon */}
            <Pressable
              onPress={onPress}
              className="flex-1 items-center justify-center h-full"
            >
              {IconComponent}
            </Pressable>

            {/* The Vertical Separator (Only render if it is NOT the last item) */}
            {index < state.routes.length - 1 && (
              <View className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-12 bg-[#E1D4BA] rounded-full" />
            )}

          </View>
        );
      })}
    </View>
  );
}

// 2. We pass our custom component into the Expo Router Tabs
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#A3C4A3',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen
        name="garden"
        options={{
          tabBarStyle: { display: 'none' },
          headerShown: false,
        }}
      />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}