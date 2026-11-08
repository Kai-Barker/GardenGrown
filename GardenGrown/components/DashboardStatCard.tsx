import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type StatCardProps = {
    iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    heading: string;
    statValue: string | number;
};

/**
 * A dashboard tile showing an icon, a heading and one large statistic. It
 * fills its grid slot exactly and sits on a solid offset shadow, matching the
 * app's other cards.
 */
export default function StatCard({ iconName, heading, statValue }: StatCardProps) {
    return (
        <View className="relative w-full h-full">

            <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />

            <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl p-4 flex-col justify-between h-full w-full">

                <View className="items-start">
                    <MaterialCommunityIcons name={iconName} size={36} color="#A3C4A3" />
                </View>

                <View className="mt-4 w-full">
                    <Text className="font-zenmaru text-[#FADBB3] text-[16px] mb-2">
                        {heading}
                    </Text>
                    <View className="h-[65px] justify-center -mt-2">
                        <Text
                            numberOfLines={1}
                            className="font-zenloop text-[#A3C4A3] text-5xl"
                        >
                            {statValue}
                        </Text>
                    </View>
                </View>

            </View>
        </View>
    );
}