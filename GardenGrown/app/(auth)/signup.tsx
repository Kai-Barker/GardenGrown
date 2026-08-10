import React, { useState } from 'react';
import { View, Text, Image, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthButton, AuthDivider } from '../../components/AuthComponents';
import FormInput from '../../components/FormInput'; 
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

export default function SignUp() {
  const router = useRouter();

  // State to control your inputs
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = async () => {
    if (!email || !password || !username) {
      Alert.alert('Hold up!', 'Please fill out all fields.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, {
        displayName: username
      });
      await setDoc(doc(db, 'users', user.uid), {
        username: username,
        email: email,
        createdAt: new Date().toISOString(),
      });
      
      console.log('Successfully created user & database record for:', username);
      router.replace('/(tabs)/dashboard');
      
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
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
              <Text className="font-zenmaru-bold text-5xl text-[#4A4A4A] mb-2">Sign Up</Text>
              <View className="w-28 h-1.5 bg-[#4A4A4A] rounded-full" />
            </View>

            {/* Updated Form Inputs */}
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