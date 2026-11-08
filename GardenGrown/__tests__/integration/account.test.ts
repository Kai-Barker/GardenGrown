/**
 * Integration: the user service against the strict fake Auth, Firestore and
 * Storage — the same sequence of calls the signup, login and profile screens
 * make.
 */
jest.mock('firebase/firestore', () => require('../helpers/fakeFirebase').firestore);
jest.mock('firebase/auth', () => require('../helpers/fakeFirebase').authApi);
jest.mock('firebase/storage', () => require('../helpers/fakeFirebase').storageApi);

import {
  changePassword,
  createUserAccount,
  createUserDocument,
  getUserProfile,
  signIn,
  signOutUser,
  updateUsername,
  uploadProfileImage,
} from '../../services/users';
import { auth, hasFile, peekDoc, resetFakeFirebase } from '../helpers/fakeFirebase';

const EMAIL = 'kai@example.com';
const PASSWORD = 'secret1';

/** What signup.tsx does: create the account, then its profile document. */
const signUp = async (email = EMAIL, password = PASSWORD, username = 'Kai') => {
  const user = await createUserAccount(email, password, username);
  await createUserDocument(user.uid, { username, email });
  return user;
};

beforeEach(() => {
  resetFakeFirebase();
  globalThis.fetch = jest.fn().mockResolvedValue({ blob: async () => ({ bytes: 3 }) }) as any;
});

describe('sign up', () => {
  it('+ creates a signed-in account with a display name and a profile document', async () => {
    const user = await signUp();
    expect(auth.currentUser).toMatchObject({ uid: user.uid, email: EMAIL, displayName: 'Kai' });
    await expect(getUserProfile(user.uid)).resolves.toMatchObject({ Username: 'Kai', Email: EMAIL, ProfileImageURI: null });
  });

  it('− refuses a second account with the same email, whatever its case', async () => {
    await signUp();
    await expect(signUp('KAI@example.com')).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
  });

  it('− refuses a password shorter than 6 characters and creates no profile', async () => {
    await expect(signUp(EMAIL, '12345')).rejects.toMatchObject({ code: 'auth/weak-password' });
    expect(auth.currentUser).toBeNull();
  });

  it('− refuses a malformed email', async () => {
    await expect(signUp('kai-at-example')).rejects.toMatchObject({ code: 'auth/invalid-email' });
  });
});

describe('sign in / out', () => {
  it('+ signs back in with the right password', async () => {
    const { uid } = await signUp();
    await signOutUser();
    expect(auth.currentUser).toBeNull();
    await expect(signIn(EMAIL, PASSWORD)).resolves.toMatchObject({ uid });
    expect(auth.currentUser?.uid).toBe(uid);
  });

  it('− refuses a wrong password, and an unknown email, with the same error', async () => {
    await signUp();
    await signOutUser();
    await expect(signIn(EMAIL, 'wrong-password')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await expect(signIn('stranger@example.com', PASSWORD)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(auth.currentUser).toBeNull();
  });
});

describe('profile', () => {
  it('+ a new username updates the profile document and the auth display name together', async () => {
    const { uid } = await signUp();
    await updateUsername(uid, 'ZenMaster');
    expect(peekDoc(`users/${uid}`)).toMatchObject({ Username: 'ZenMaster' });
    expect(auth.currentUser?.displayName).toBe('ZenMaster');
  });

  it('− renaming a user with no profile document fails and leaves auth untouched', async () => {
    const user = await createUserAccount(EMAIL, PASSWORD, 'Kai'); // no createUserDocument
    await expect(updateUsername(user.uid, 'ZenMaster')).rejects.toMatchObject({ code: 'not-found' });
    expect(auth.currentUser?.displayName).toBe('Kai');
  });

  it('+ a profile photo is stored, and its URL saved on the document and auth profile', async () => {
    const { uid } = await signUp();
    const url = await uploadProfileImage(uid, 'file:///photo.jpg');
    expect(hasFile(`profileImages/${uid}`)).toBe(true);
    expect(peekDoc(`users/${uid}`)!.ProfileImageURI).toBe(url);
    expect(auth.currentUser?.photoURL).toBe(url);
  });

  it('+ uploading a new photo replaces the old one at the same path', async () => {
    const { uid } = await signUp();
    const first = await uploadProfileImage(uid, 'file:///one.jpg');
    const second = await uploadProfileImage(uid, 'file:///two.jpg');
    expect(second).toBe(first);
  });
});

describe('change password', () => {
  it('+ the new password works and the old one stops working', async () => {
    await signUp();
    await changePassword(PASSWORD, 'brand-new-pass');
    await signOutUser();

    await expect(signIn(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await expect(signIn(EMAIL, 'brand-new-pass')).resolves.toMatchObject({ email: EMAIL });
  });

  it('− a wrong current password changes nothing', async () => {
    await signUp();
    await expect(changePassword('not-my-password', 'brand-new-pass')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await signOutUser();
    await expect(signIn(EMAIL, PASSWORD)).resolves.toBeTruthy();
  });

  it('− a too-short new password is refused and the old one still works', async () => {
    await signUp();
    await expect(changePassword(PASSWORD, '123')).rejects.toMatchObject({ code: 'auth/weak-password' });
    await signOutUser();
    await expect(signIn(EMAIL, PASSWORD)).resolves.toBeTruthy();
  });

  it('− does nothing when signed out', async () => {
    await signUp();
    await signOutUser();
    await expect(changePassword(PASSWORD, 'brand-new-pass')).resolves.toBeUndefined();
    await expect(signIn(EMAIL, PASSWORD)).resolves.toBeTruthy();
  });
});
