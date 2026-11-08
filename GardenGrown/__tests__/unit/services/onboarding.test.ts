/**
 * Unit tests for services/onboarding.ts (AsyncStorage is the official jest mock,
 * wired up in helpers/setup.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasCompletedOnboarding, setOnboardingComplete } from '../../../services/onboarding';

const KEY = 'gardengrown.onboardingComplete.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('hasCompletedOnboarding', () => {
  it('+ is false on a fresh device', async () => {
    await expect(hasCompletedOnboarding()).resolves.toBe(false);
  });

  it('+ is true once the tour has been completed', async () => {
    await AsyncStorage.setItem(KEY, 'true');
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
  });

  it.each(['false', 'TRUE', '1', ''])('− only the exact string "true" counts (not %p)', async (value) => {
    await AsyncStorage.setItem(KEY, value);
    await expect(hasCompletedOnboarding()).resolves.toBe(false);
  });

  it('− ignores flags from an older tour version', async () => {
    await AsyncStorage.setItem('gardengrown.onboardingComplete.v0', 'true');
    await expect(hasCompletedOnboarding()).resolves.toBe(false);
  });

  it('− resolves true if storage is unreadable, so users are never trapped in the tour', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk error'));
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
  });
});

describe('setOnboardingComplete', () => {
  it('+ records completion under the versioned key', async () => {
    await setOnboardingComplete();
    await expect(AsyncStorage.getItem(KEY)).resolves.toBe('true');
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
  });

  it('+ is idempotent', async () => {
    await setOnboardingComplete();
    await setOnboardingComplete();
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
  });

  it('− swallows a failed write rather than crashing the splash screen', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(setOnboardingComplete()).resolves.toBeUndefined();
  });
});
