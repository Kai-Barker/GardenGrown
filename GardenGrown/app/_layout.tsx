import { useFonts } from 'expo-font';
import { ZenLoop_400Regular } from '@expo-google-fonts/zen-loop';
import { ZenMaruGothic_400Regular, ZenMaruGothic_700Bold } from '@expo-google-fonts/zen-maru-gothic';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import "../global.css";

// Prevent the splash screen from hiding before fonts are loaded
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Load the fonts
  const [fontsLoaded, fontError] = useFonts({
    ZenLoop: ZenLoop_400Regular,
    ZenMaruRegular: ZenMaruGothic_400Regular,
    ZenMaruBold: ZenMaruGothic_700Bold,
  });

  // Hide the splash screen once fonts are ready
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  
  if (!fontsLoaded && !fontError) {
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