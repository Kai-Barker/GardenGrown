import { View, Text, Image, ImageSourcePropType, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type GardenCardProps = {
  title?: string;
  gardenName?: string;
  imageSource?: ImageSourcePropType;
  onPressEnter?: () => void;
  totalCards?: number;
  currentIndex?: number;
};

export default function GardenCard({
  title = "Current Garden",
  gardenName = "Raked Sand",
  imageSource,
  onPressEnter,
  totalCards = 3,
  currentIndex = 0,
}: GardenCardProps) {
  return (
    /* Stripped m-2 so it fills its 4-column grid slot flush */
    <View className="relative w-full h-full">
      
      {/* 1. Solid Shadow */}
      <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />

      {/* 2. Main Card Content */}
      <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl p-3 flex-col justify-between h-full w-full">
        
        <View>
          <Text className="font-zenmaru text-[#FADBB3] text-base leading-tight">
            {title}
          </Text>
          <Text className="font-zenloop text-gray-300 text-2xl -mt-1">
            {gardenName}
          </Text>
        </View>

        <View className="items-center justify-center my-1">
          {imageSource ? (
            <Image 
              source={imageSource} 
              className="w-full h-16" 
              resizeMode="contain" 
            />
          ) : (
            <View className="items-center justify-center py-2 px-3 rounded-xl border-2 border-dashed border-[#A3C4A3]/40 bg-[#4A4A4A]/20 w-5/6 h-16">
              <MaterialCommunityIcons name="image-filter-vintage" size={22} color="#A3C4A3" />
              <Text className="font-zenloop text-[#A3C4A3]/80 text-base -mt-1">
                Garden Snapshot Preview
              </Text>
            </View>
          )}
        </View>

        <View className="items-center">
          <Pressable onPress={onPressEnter} className="active:opacity-75">
            <Text className="font-zenloop text-[#A3C4A3] text-2xl leading-none mb-1.5">
              -- Enter Garden --
            </Text>
          </Pressable>

          <View className="flex-row justify-center items-center gap-1.5">
            {Array.from({ length: totalCards }).map((_, idx) => (
              <View
                key={idx}
                className={`w-2 h-2 rounded-full ${
                  idx === currentIndex
                    ? 'bg-[#A3C4A3]'
                    : 'border border-[#A3C4A3]'
                }`}
              />
            ))}
          </View>
        </View>

      </View>
    </View>
  );
}