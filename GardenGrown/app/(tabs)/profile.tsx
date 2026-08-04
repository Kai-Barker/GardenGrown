import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import ProfileField from '../../components/FormInput';

export default function ProfileScreen() {
  const [username, setUsername] = useState('ZenGardener123');
  const [email, setEmail] = useState('zen@example.com');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notifications, setNotifications] = useState(true);
  
  // State to hold the local image URI
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const ThickDivider = () => (
    <View className="h-1 bg-[#4A4A4A] rounded-full w-full my-7" />
  );

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  return (
    <View className="flex-1 bg-[#EFEAE1]">
      {/* Texture Overlay (Styling Fix #1) */}
      <View pointerEvents="none" className="absolute w-full h-full z-0">
        <Image
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>

      <SafeAreaView className="flex-1" edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 28, // Match dashboard padding
              paddingTop: 30,
              paddingBottom: 40,
            }}
          >
            <View className="flex-row items-center justify-center mb-10 gap-x-5">
              {/* Image Container */}
              <View className="relative w-32 h-32">
                {/* 1. Solid Shadow Layer */}
                <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />
                {/* 2. Main Card Layer */}
                <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl items-center justify-center overflow-hidden w-full h-full">
                   {profileImage ? (
                     <Image 
                       source={{ uri: profileImage }} 
                       className="w-full h-full" 
                       resizeMode="cover" 
                     />
                   ) : (
                     <MaterialCommunityIcons name="image-outline" size={56} color="#A3C4A3" />
                   )}
                </View>
              </View>
              
              {/* Edit Button */}
              <Pressable 
                onPress={pickImage}
                className="relative w-16 h-16 active:opacity-80"
              >
                {/* 1. Solid Shadow Layer */}
                <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />
                {/* 2. Main Card Layer */}
                <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl items-center justify-center w-full h-full">
                  <MaterialCommunityIcons name="plus" size={38} color="#A3C4A3" />
                </View>
              </Pressable>

            </View>

            {/* Basic Info Fields (Using upgraded component) */}
            <ProfileField
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="ZenGardener123"
            />
            <ProfileField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="zen@example.com"
              keyboardType="email-address"
            />

            <ThickDivider />

            {/* Password Section (Using thick wireframe font style) */}
            <Text className="font-zenmaru-bold text-3xl text-[#4A4A4A] mb-5">
              Change Password?
            </Text>
            
            <ProfileField
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              isPassword={true}
              placeholder="Enter current password"
            />
            <ProfileField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              isPassword={true}
              placeholder="Enter new password"
            />

            <ThickDivider />

            {/* Settings Section */}
            <View className="relative w-full mt-2 mb-4">
              <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
              <View className="relative flex-row items-center justify-between px-4 py-3 bg-[#545E75] border-2 border-[#4A4A4A] rounded-xl w-full">
                <Text className="font-zenmaru text-xl text-[#A3C4A3]">
                  Notifications
                </Text>
                <Switch
                  trackColor={{ false: '#374151', true: '#A3C4A3' }} 
                  thumbColor={Platform.OS === 'ios' ? undefined : '#F4EFE6'}
                  ios_backgroundColor="#374151"
                  onValueChange={setNotifications}
                  value={notifications}
                />
              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}