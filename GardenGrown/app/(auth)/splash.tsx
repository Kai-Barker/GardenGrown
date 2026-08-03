import { View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// Re-using the same AuthComponents.tsx we already created
import { AuthButton } from '../../components/AuthComponents';

export default function Splash() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#EFEAE1]">
      {/* Texture Overlay (edged to edge) */}
      <View pointerEvents="none" className="absolute w-full h-full z-0">
        <Image
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>

      <SafeAreaView className="flex-1 justify-center items-center">
        <View className="w-[60vw] self-center flex-col items-center">

          {/* Logo Placeholder (matches new narrow width) */}
          <View className="w-full h-48 border-4 border-[#4A4A4A] rounded-3xl items-center justify-center bg-[#FADBB3]/50 mb-16 relative">
            <MaterialCommunityIcons name="image-filter-hdr" size={80} color="#4A4A4A" />
          </View>

          {/* Action Buttons: Now centered and restricted by the w-3/4 container */}
          <View className="w-full mt-8">
            <AuthButton 
              title="Log In" 
              onPress={() => router.push('/(auth)/login')} 
            />
            <AuthButton 
              title="Sign Up" 
              variant="secondary" 
              onPress={() => router.push('/(auth)/signup')} 
            />
          </View>

        </View>

      </SafeAreaView>
    </View>
  );
}