import { Redirect } from 'expo-router';

/**
 * The app's entry route ("/"). It only parks the user on the splash screen
 * while the root layout's guard waits for fonts, auth state and the first-run
 * flag; the guard then sends them to the real destination (dashboard when
 * logged in, the onboarding tour on a new device, otherwise splash).
 */
export default function Index() {
  return <Redirect href="/(auth)/splash" />;
}
