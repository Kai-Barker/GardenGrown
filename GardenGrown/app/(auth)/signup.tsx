import React, { useState } from 'react';
import { View, Text, Image, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthButton, AuthDivider } from '../../components/AuthComponents';
import FormInput from '../../components/FormInput';
import { createUserAccount, createUserDocument } from '../../services/users';

/** The registration screen: username, email and password, with a link across to log in. */
export default function SignUp() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Checks every field is filled, creates the Firebase account and its
   * Firestore profile document, then goes to the dashboard. Firebase's error
   * message (e.g. email already in use) is shown in an alert on failure.
   */
  const handleSignUp = async () => {
    if (!email || !password || !username) {
      Alert.alert('Hold up!', 'Please fill out all fields.');
      return;
    }

    try {
      const user = await createUserAccount(email, password, username);
      await createUserDocument(user.uid, { username, email });

      console.log('Successfully created user & database record for:', username);
      router.replace('/(tabs)/dashboard');

    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
    }
  };

  return (
    <View className="flex-1 bg-[#EFEAE1]">
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

            <View className="items-center mb-10">
              <Text className="font-zenmaru-bold text-5xl text-[#4A4A4A] mb-2">Sign Up</Text>
              <View className="w-28 h-1.5 bg-[#4A4A4A] rounded-full" />
            </View>

            <FormInput
              label="Username"
              placeholder="Choose a username"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
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
              placeholder="Create a password"
              isPassword={true}
              value={password}
              onChangeText={setPassword}
            />

            <View className="mt-4">
              <AuthButton title="Sign Up" onPress={handleSignUp} />
              {/* Google sign-in needs a development build — the Google auth libraries
                  require custom native code and don't run in Expo Go. This was also
                  wired to handleSignUp, which ran the email/password signup instead;
                  the handler below deliberately doesn't exist, so uncommenting fails
                  loudly rather than restoring that bug.
                  See docs.expo.dev/guides/google-authentication
              <AuthButton title="Google Sign in" variant="secondary" onPress={handleGoogleSignIn} /> */}
            </View>

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