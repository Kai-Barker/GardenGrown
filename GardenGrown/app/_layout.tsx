import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { ZenLoop_400Regular } from '@expo-google-fonts/zen-loop';
import { ZenMaruGothic_400Regular, ZenMaruGothic_700Bold } from '@expo-google-fonts/zen-maru-gothic';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

import "../global.css";

// Prevent the splash screen from hiding automatically
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  // Auth State
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Load the fonts
  const [fontsLoaded, fontError] = useFonts({
    ZenLoop: ZenLoop_400Regular,
    ZenMaruRegular: ZenMaruGothic_400Regular,
    ZenMaruBold: ZenMaruGothic_700Bold,
  });

  // 1. Listen for Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (initializing) setInitializing(false);
    });

    return unsubscribe;
  }, []);

  // 2. Hide Splash Screen ONLY when both fonts are loaded AND Firebase initialized
  useEffect(() => {
    if ((fontsLoaded || fontError) && !initializing) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, initializing]);

  // 3. Handle Route Protection / Automatic Skipping
  useEffect(() => {
    // Don't run routing logic until fonts and auth state are ready
    if (initializing || (!fontsLoaded && !fontError)) return;

    // segments[0] checks top-level directory (e.g. '(auth)' or '(tabs)')
    const inAuthGroup = segments[0] === '(auth)';

    if (user && inAuthGroup) {
      // User is logged in -> Skip auth screens and send to Dashboard
      router.replace('/(tabs)/dashboard');
    } else if (!user && !inAuthGroup) {
      // User is NOT logged in -> Send to Login
      router.replace('/(auth)/login');
    }
  }, [user, initializing, segments, fontsLoaded, fontError]);

  // While fonts/auth are loading, return null (Splash Screen covers the display)
  if ((!fontsLoaded && !fontError) || initializing) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="garden" />
    </Stack>
  );
}