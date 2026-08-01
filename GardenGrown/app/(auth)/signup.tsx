import { View, Text, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthInput, AuthButton, AuthDivider } from '../../components/AuthComponents';

export default function SignUp() {
  const router = useRouter();

  const handleSignUp = () => {
    // Navigate to the dashboard upon account creation
    router.replace('/(tabs)/dashboard');
  };

  return (
    <View className="flex-1 bg-[#EFEAE1]">
      {/* Texture Overlay */}
      <View pointerEvents="none" className="absolute w-full h-full z-0">
        <Image
          source={require('../../assets/textures/SandTextureVertical.png')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView 
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 20 }} 
            showsVerticalScrollIndicator={false}
          >
            
            {/* Title Header */}
            <View className="items-center mb-10">
              <Text className="font-zenmaru-bold text-5xl text-[#4A4A4A] mb-2">Sign Up</Text>
              <View className="w-28 h-1.5 bg-[#4A4A4A] rounded-full" />
            </View>

            {/* Form Inputs */}
            <AuthInput 
              label="Username" 
              placeholder="Choose a username" 
              autoCapitalize="none"
            />
            <AuthInput 
              label="Email" 
              placeholder="Enter your email" 
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <AuthInput 
              label="Password" 
              placeholder="Create a password" 
              secureTextEntry 
            />

            {/* Actions */}
            <View className="mt-4">
              <AuthButton title="Sign Up" onPress={handleSignUp} />
              <AuthButton title="Google Sign in" variant="secondary" onPress={handleSignUp} />
            </View>

            {/* Footer / Switch Auth */}
            <AuthDivider text="Already Have an Account?" />
            <AuthButton 
              title="Log In" 
              variant="secondary" 
              onPress={() => router.replace('/(auth)/login')} 
            />

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}