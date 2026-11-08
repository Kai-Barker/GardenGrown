import { View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthButton } from '../../components/AuthComponents';

/**
 * The signed-out landing screen: the logo on a sand texture, with buttons to
 * log in, sign up, or replay the onboarding tour.
 */
export default function Splash() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#EFEAE1]">
      <View pointerEvents="none" className="absolute w-full h-full z-0">
        <Image
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>

      <SafeAreaView className="flex-1 justify-center items-center">
        <View className="w-[60vw] self-center flex-col items-center">

          <Image
            source={require('../../assets/images/logo.png')}
            className="w-full h-48 mb-16"
            resizeMode="contain"
          />

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
            {/* Replays the first-run tour. push, not replace — the tour exits
                with a replace back to here, so the stack stays flat. */}
            <AuthButton
              title="How It Works"
              variant="secondary"
              onPress={() => router.push('/(auth)/onboarding')}
            />
          </View>

        </View>

      </SafeAreaView>
    </View>
  );
}