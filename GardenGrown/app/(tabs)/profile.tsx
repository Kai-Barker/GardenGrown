import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, Switch, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ThickDivider from '@/components/ThickDivider';
import FormInput from '../../components/FormInput';
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential, updateProfile } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../firebase';

export default function ProfileScreen() {
  const [username, setUsername] = useState('ZenGardener123');
  const [savedUsername, setSavedUsername] = useState('');
  const [email, setEmail] = useState('zen@example.com');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notifications, setNotifications] = useState(true);

  // State to hold the local/remote image URI
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          setEmail(user.email || '');
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            const fetchedName = data.Username || 'ZenGardener123';
            setUsername(fetchedName);
            setSavedUsername(fetchedName);
            if (data.ProfileImageURI) {
              setProfileImage(data.ProfileImageURI);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Missing Fields', 'Please enter both your current and new password.');
      return;
    }

    const user = auth.currentUser;
    if (user && user.email) {
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        Alert.alert('Success!', 'Your password has been updated.');
        setCurrentPassword('');
        setNewPassword('');
      } catch (error: any) {
        Alert.alert('Update Failed', error.message);
      }
    }

  }

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error: any) {
      Alert.alert('Sign Out Error', error.message);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const localUri = result.assets[0].uri;
      setProfileImage(localUri); // optimistic preview

      const user = auth.currentUser;
      if (!user) return;

      setUploadingImage(true);
      try {
        const response = await fetch(localUri);
        const blob = await response.blob();

        const imageRef = ref(storage, `profileImages/${user.uid}`);
        await uploadBytes(imageRef, blob);
        const downloadURL = await getDownloadURL(imageRef);

        await updateDoc(doc(db, 'users', user.uid), {
          ProfileImageURI: downloadURL,
        });
        await updateProfile(user, {
          photoURL: downloadURL,
        });

        setProfileImage(downloadURL);
      } catch (error: any) {
        Alert.alert('Upload Failed', 'Could not upload profile photo: ' + error.message);
      } finally {
        setUploadingImage(false);
      }
    }
  };
  const handleUsernameBlur = async () => {
    const trimmedName = username.trim();

    if (!trimmedName) {
      setUsername(savedUsername);
      return;
    }

    if (trimmedName === savedUsername) {
      return;
    }

    const user = auth.currentUser;
    if (user) {
      try {

        await updateDoc(doc(db, 'users', user.uid), {
          Username: trimmedName,
        });


        await updateProfile(user, {
          displayName: trimmedName,
        });


        setSavedUsername(trimmedName);
        console.log('Username updated to:', trimmedName);
        Alert.alert("Username Updated");
      } catch (error: any) {
        Alert.alert('Update Failed', 'Could not save username: ' + error.message);
        setUsername(savedUsername);
      }
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
                disabled={uploadingImage}
                className="relative w-16 h-16 active:opacity-80"
              >
                {/* 1. Solid Shadow Layer */}
                <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />
                {/* 2. Main Card Layer */}
                <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl items-center justify-center w-full h-full">
                  <MaterialCommunityIcons
                    name={uploadingImage ? 'loading' : 'plus'}
                    size={38}
                    color="#A3C4A3"
                  />
                </View>
              </Pressable>

            </View>

            {/* Basic Info Fields */}
            <FormInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              onBlur={handleUsernameBlur}
              placeholder="ZenGardener123"
            />
            {/* Email usually shouldn't be editable here unless you add a specific re-auth flow for changing emails, so we can make it read-only or just a standard input */}
            <FormInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="zen@example.com"
              keyboardType="email-address"
              readOnly
            />

            <ThickDivider />

            {/* Password Section (Using thick wireframe font style) */}
            <Text className="font-zenmaru-bold text-3xl text-[#4A4A4A] mb-5">
              Change Password?
            </Text>

            <FormInput
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              isPassword={true}
              placeholder="Enter current password"
            />
            <FormInput
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              isPassword={true}
              placeholder="Enter new password"
            />

            {/* Update Password Button */}
            <Pressable
              onPress={handleUpdatePassword}
              className="relative w-full mt-2 active:opacity-80"
            >
              <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
              <View className="relative bg-[#A3C4A3] px-6 py-4 rounded-xl border-2 border-[#4A4A4A] items-center">
                <Text className="font-zenmaru-bold text-xl text-[#4A4A4A]">Update Password</Text>
              </View>
            </Pressable>

            <ThickDivider />

            {/* Settings Section */}
            <View className="relative w-full mt-2 mb-8">
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

            {/* Logout Button */}
            <Pressable
              onPress={handleSignOut}
              className="relative w-[60%] self-center active:opacity-80 mt-4"
            >
              <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
              <View className="relative bg-[#D9534F] px-6 py-3 rounded-xl border-2 border-[#4A4A4A] items-center">
                <Text className="text-white font-zenmaru-bold text-lg">Log Out</Text>
              </View>
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}