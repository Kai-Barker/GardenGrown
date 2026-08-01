import { Redirect } from 'expo-router';

export default function Index() {
  // TODO: Add Firebase Auth check here later.
  // For now, we will just force-redirect to the Onboarding screen so you can build it.
  
  return <Redirect href="/(auth)/splash" />;
  
  // To test your tabs later, change it to:
  // return <Redirect href="/(tabs)/dashboard" />;
}