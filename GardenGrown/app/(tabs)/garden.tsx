import { View, Text, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GardenInventory } from '../../components/GardenInventory';

export default function GardenScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#F4EFE6]">
      {/* Background Texture */}
      <View pointerEvents="none" className="absolute inset-0 z-0">
        <Image
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>

      <SafeAreaView className="flex-1 justify-between" edges={['top']}>
        
        {/* HEADER SECTION */}
        <View className="px-6 pt-2">
          {/* Back button */}
          <Pressable 
            onPress={() => router.push('/(tabs)/dashboard')} 
            className="flex-row items-center mb-2 active:opacity-60"
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color="#4A4A4A" />
            <Text className="font-zenmaru text-2xl text-[#4A4A4A]">Dashboard</Text>
          </Pressable>

          {/* Title Dropdown */}
          <Pressable className="flex-row items-center gap-x-2">
            <Text className="font-zenmaru-bold text-4xl text-[#4A4A4A]">Raked Sand</Text>
            <MaterialCommunityIcons name="chevron-down" size={32} color="#4A4A4A" />
          </Pressable>
        </View>

        {/* MAIN GARDEN CANVAS GRID */}
        <View className="flex-1 mx-6 my-4 border border-[#4A4A4A]/20 bg-[#EFEAE1]/50 rounded-lg overflow-hidden">
          {/* Simple visual grid lines */}
          <View className="flex-1 flex-col justify-between">
            {[...Array(8)].map((_, i) => (
              <View key={i} className="w-full h-[1px] bg-[#4A4A4A]/10" />
            ))}
          </View>
          <View className="absolute inset-0 flex-row justify-between">
            {[...Array(6)].map((_, i) => (
              <View key={i} className="h-full w-[1px] bg-[#4A4A4A]/10" />
            ))}
          </View>
        </View>

        {/* EXPANDABLE INVENTORY BOTTOM DRAWER */}
        <GardenInventory />

      </SafeAreaView>
    </View>
  );
}