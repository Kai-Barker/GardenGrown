import { View, Text, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthInput, AuthButton, AuthDivider } from '../../components/AuthComponents';

export default function Login() {
    const router = useRouter();

    const handleLogin = () => {
        // Navigate to the dashboard upon authentication
        router.replace('/(tabs)/dashboard');
    };

    return (
        <View className="flex-1 bg-[#EFEAE1]">
            {/* Texture Overlay */}
            <View pointerEvents="none" className="absolute w-full h-full z-0">
                <Image
                    source={require('../../assets/textures/SandTextureVertical.webp')}
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
                            <Text className="font-zenmaru-bold text-5xl text-[#4A4A4A] mb-2">Log In</Text>
                            <View className="w-24 h-1.5 bg-[#4A4A4A] rounded-full" />
                        </View>

                        {/* Form Inputs */}
                        <AuthInput
                            label="Email"
                            placeholder="Enter your email"
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        <AuthInput
                            label="Password"
                            placeholder="Enter your password"
                            secureTextEntry
                        />

                        {/* Actions */}
                        <View className="mt-4 w-[60%] self-center">
                            <AuthButton title="Log In" onPress={handleLogin} />
                            <AuthButton title="Google Sign in" variant="secondary" onPress={handleLogin} />
                        </View>

                        {/* Footer / Switch Auth */}
                        <AuthDivider text="Dont Have an Account?" />
                        <View className="w-[60%] self-center">
                            <AuthButton
                                title="Sign Up"
                                variant="secondary"
                                onPress={() => router.replace('/(auth)/signup')}
                            />
                        </View>

                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}