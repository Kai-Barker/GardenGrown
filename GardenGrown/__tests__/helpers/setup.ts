/**
 * Runs before every test file.
 *
 * The app's firebase.js calls initializeApp/initializeAuth at import time,
 * which can't run under Jest (and must never reach the real project). Every
 * test gets the fake's `{ auth, db, storage }` instead. Unit tests set
 * `auth.currentUser` directly; integration tests also swap the SDK modules
 * themselves for the fake (see fakeFirebase.ts).
 */
jest.mock('../../firebase', () => require('./fakeFirebase').firebaseModule);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
