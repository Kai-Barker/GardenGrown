import React, { useState } from 'react';
import { View, Text, Image, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthButton, AuthDivider } from '../../components/AuthComponents'; 
import FormInput from '../../components/FormInput'; 

import { signIn } from '../../services/users';

export default function Login() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // --- UPDATED HANDLER ---
    const handleLogin = async () => {
        // 1. Basic validation
        if (!email || !password) {
            Alert.alert('Hold up!', 'Please enter your email and password.');
            return;
        }

        try {
            // 2. Tell Firebase to log the user in
            const user = await signIn(email, password);
            console.log('Successfully logged in:', user.email);
            
            // 3. Navigate to dashboard on success
            router.replace('/(tabs)/dashboard');
        } catch (error: any) {
            // 4. Handle errors (wrong password, user not found, etc.)
            Alert.alert('Login Failed', error.message);
        }
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

                        {/* Updated Form Inputs */}
                        <FormInput
                            label="Email"
                            placeholder="Enter your email"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                        />
                        <FormInput
                            label="Password"
                            placeholder="Enter your password"
                            isPassword={true}
                            value={password}
                            onChangeText={setPassword}
                        />

                        {/* Actions */}
                        <View className="mt-4 w-[60%] self-center">
                            <AuthButton title="Log In" onPress={handleLogin} />
                            {/* Google sign-in needs a development build — the Google auth
                                libraries require custom native code and don't run in Expo Go.
                                Restore once off Expo Go; the handler below doesn't exist yet,
                                so uncommenting will fail loudly until it's written.
                                See docs.expo.dev/guides/google-authentication
                            <AuthButton title="Google Sign in" variant="secondary" onPress={handleGoogleSignIn} /> */}
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