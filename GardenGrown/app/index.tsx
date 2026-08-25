import { Redirect } from 'expo-router';

export default function Index() {
  // "/" sits outside (auth) and (tabs), so the root layout's guard takes over
  // as soon as fonts, auth state and the first-run flag resolve. It picks the
  // real destination: dashboard when logged in, the onboarding tour on a device
  // that has never seen it, otherwise the splash screen.
  //
  // This redirect just parks us somewhere sensible in the meantime.
  return <Redirect href="/(auth)/splash" />;
}
