import { View, Text, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatCard from '../../components/DashboardStatCard';
import GardenCard from '../../components/DashboardGardenCard';

export default function Dashboard() {
  return (
    <View className="flex-1 bg-[#EFEAE1]">
      {/* Texture Overlay */}
      <View
        pointerEvents="none"
        className="absolute w-full h-full z-0"
      >
        <Image
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>
      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 5
          }}
        >
          <View className="flex-row flex-wrap justify-between gap-y-3">
            <View className="w-full mb-1">
              <Text className="font-zenmaru-bold text-4.5xl text-[#4A4A4A] mb-1 leading-tight">
                Welcome Back
              </Text>
              <Text className="font-zenloop text-3xl text-gray-500">
                Lets see how your garden has grown
              </Text>
            </View>
            {/* Each spans 2 Columns (48% Width) */}
            <View className="w-[48%] h-[20vh]">
              <StatCard
                iconName="tree"
                heading="Total Gardens:"
                statValue="1"
              />
            </View>
            <View className="w-[48%] h-[20vh]">
              <StatCard
                iconName="flower-tulip"
                heading="Total Decorations"
                statValue="32"
              />
            </View>
            <View className="w-full h-[25vh] my-1">
              <GardenCard
                title="Current Garden"
                gardenName="Raked Sand"
                currentIndex={0}
                totalCards={3}
                onPressEnter={() => console.log('Entering garden...')}
              />
            </View>
            {/* STAT CARD 3 & 4: Each spans 2 Columns (48% Width) */}
            <View className="w-[48%] h-[20vh]">
              <StatCard
                iconName="leaf"
                heading="Gardened Since:"
                statValue="July 2026"
              />
            </View>
            <View className="w-[48%] h-[20vh]">
              <StatCard
                iconName="sprout"
                heading="Items Placed:"
                statValue="50"
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}