import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tracks whether this device has been shown the onboarding tour.
 *
 * Device-local, not per-account: the tour teaches the app's gestures, not
 * anything about a user's data, so signing in as someone else on a phone that
 * has already seen it shouldn't replay it.
 *
 * The `.v1` suffix is deliberate — bumping it is the whole migration if a
 * future release adds slides worth re-showing to existing users.
 */
const ONBOARDING_KEY = 'gardengrown.onboardingComplete.v1';

/**
 * Whether the tour has already been completed (or skipped) on this device.
 *
 * Failing reads resolve to `true`. If storage is unreadable the safe default is
 * to send the user on to the splash screen — the alternative traps them in the
 * tour on every single launch, with no way out.
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === 'true';
  } catch {
    return true;
  }
}

/**
 * Marks the tour as done. Idempotent, so the "How It Works" replay on the
 * splash screen can call it on exit without checking anything first.
 */
export async function setOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // A failed write only costs the user seeing the tour once more.
  }
}
