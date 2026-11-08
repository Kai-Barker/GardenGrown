/**
 * REGRESSION: tapping the Profile tab crashed with
 *   "TypeError: Cannot read property 'navigate' of undefined"
 *
 * expo-router 58 (Expo SDK 58) stopped passing a `navigation` prop to custom
 * tab bars; they get `navigateToTab(routeKey)` and an `emitter` instead. The
 * tab bar still called `navigation.navigate('profile')`.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CustomTabBar, { type TabBarProps } from '../../components/CustomTabBar';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Tabs: () => null,
}));

const ROUTES = [
  { key: 'dashboard-key', name: 'dashboard' },
  { key: 'profile-key', name: 'profile' },
];

const setup = async (index = 0, { prevent = false } = {}) => {
  const navigateToTab = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: prevent }));
  const props = {
    state: { index, routes: ROUTES },
    descriptors: {},
    emitter: { emit },
    navigateToTab,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as TabBarProps;

  await render(<CustomTabBar {...props} />);
  return { navigateToTab, emit };
};

beforeEach(() => mockPush.mockClear());

describe('CustomTabBar (SDK 58 navigation API)', () => {
  it('+ tapping Profile switches tab by route KEY, without crashing', async () => {
    const { navigateToTab, emit } = await setup(0);
    await fireEvent.press(screen.getByLabelText('Profile'));
    expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'profile-key', canPreventDefault: true });
    expect(navigateToTab).toHaveBeenCalledWith('profile-key');
  });

  it('+ tapping Dashboard from Profile switches back', async () => {
    const { navigateToTab } = await setup(1);
    await fireEvent.press(screen.getByLabelText('Dashboard'));
    expect(navigateToTab).toHaveBeenCalledWith('dashboard-key');
  });

  it('− tapping the tab you are already on does not navigate (but still emits tabPress)', async () => {
    const { navigateToTab, emit } = await setup(1);
    await fireEvent.press(screen.getByLabelText('Profile'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('− a screen that prevents tabPress keeps the user where they are', async () => {
    const { navigateToTab } = await setup(0, { prevent: true });
    await fireEvent.press(screen.getByLabelText('Profile'));
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('+ the tree button pushes the garden screen rather than switching tab', async () => {
    const { navigateToTab } = await setup(0);
    await fireEvent.press(screen.getByLabelText('Garden'));
    expect(mockPush).toHaveBeenCalledWith('/garden');
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
