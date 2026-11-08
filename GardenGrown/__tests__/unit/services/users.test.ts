/**
 * Unit tests for services/users.ts. The Firebase SDK is replaced with jest.fn()
 * mocks, so these check exactly what each function sends to Firebase, in what
 * order, and what happens when a call fails.
 */
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, collection, id) => ({ path: `${collection}/${id}` })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
}));
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  signOut: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn((email, password) => ({ email, password })) },
}));
jest.mock('firebase/storage', () => ({
  ref: jest.fn((_storage, path) => ({ fullPath: path })),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
}));

import * as firestore from 'firebase/firestore';
import * as fbAuth from 'firebase/auth';
import * as fbStorage from 'firebase/storage';
import {
  changePassword,
  createUserAccount,
  createUserDocument,
  getUserProfile,
  signIn,
  signOutUser,
  updateUsername,
  uploadProfileImage,
} from '../../../services/users';
import { auth } from '../../helpers/fakeFirebase';

const fs = firestore as jest.Mocked<typeof firestore>;
const fa = fbAuth as jest.Mocked<typeof fbAuth>;
const st = fbStorage as jest.Mocked<typeof fbStorage>;

const USER = { uid: 'u1', email: 'kai@example.com', displayName: 'Kai', photoURL: null };
const failure = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  jest.clearAllMocks();
  auth.currentUser = null;
});

describe('getUserProfile', () => {
  it('+ returns the profile data when the document exists', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ Username: 'Kai' }) } as any);
    await expect(getUserProfile('u1')).resolves.toEqual({ Username: 'Kai' });
    expect(fs.doc).toHaveBeenCalledWith(expect.anything(), 'users', 'u1');
  });

  it('− returns null when the user has no profile document', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined } as any);
    await expect(getUserProfile('nobody')).resolves.toBeNull();
  });

  it('− propagates a read failure', async () => {
    fs.getDoc.mockRejectedValue(failure('permission-denied'));
    await expect(getUserProfile('u1')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('createUserDocument', () => {
  it('+ writes the profile with a server timestamp and no image', async () => {
    await createUserDocument('u1', { username: 'Kai', email: 'kai@example.com' });
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'users/u1' }, {
      Username: 'Kai',
      Email: 'kai@example.com',
      AccountCreated: 'SERVER_TS',
      ProfileImageURI: null,
    });
  });

  it('− propagates a write failure', async () => {
    fs.setDoc.mockRejectedValueOnce(failure('unavailable'));
    await expect(createUserDocument('u1', { username: 'Kai', email: 'k@e.com' })).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('updateUsername', () => {
  it('+ updates Firestore and the signed-in auth profile', async () => {
    auth.currentUser = { ...USER };
    await updateUsername('u1', 'NewName');
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { Username: 'NewName' });
    expect(fa.updateProfile).toHaveBeenCalledWith(auth.currentUser, { displayName: 'NewName' });
  });

  it('+ still updates Firestore when nobody is signed in', async () => {
    await updateUsername('u1', 'NewName');
    expect(fs.updateDoc).toHaveBeenCalledTimes(1);
    expect(fa.updateProfile).not.toHaveBeenCalled();
  });

  it('− leaves the auth profile alone if the Firestore write fails', async () => {
    auth.currentUser = { ...USER };
    fs.updateDoc.mockRejectedValueOnce(failure('not-found'));
    await expect(updateUsername('u1', 'NewName')).rejects.toMatchObject({ code: 'not-found' });
    expect(fa.updateProfile).not.toHaveBeenCalled();
  });
});

describe('uploadProfileImage', () => {
  const blob = { size: 3 };
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ blob: async () => blob });
    globalThis.fetch = fetchMock as any;
    st.uploadBytes.mockResolvedValue({} as any);
    st.getDownloadURL.mockResolvedValue('https://img/u1');
  });

  it('+ uploads to the per-user path, records the URL everywhere, and returns it', async () => {
    auth.currentUser = { ...USER };
    await expect(uploadProfileImage('u1', 'file:///photo.jpg')).resolves.toBe('https://img/u1');

    expect(fetchMock).toHaveBeenCalledWith('file:///photo.jpg');
    expect(st.ref).toHaveBeenCalledWith(expect.anything(), 'profileImages/u1');
    expect(st.uploadBytes).toHaveBeenCalledWith({ fullPath: 'profileImages/u1' }, blob);
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { ProfileImageURI: 'https://img/u1' });
    expect(fa.updateProfile).toHaveBeenCalledWith(auth.currentUser, { photoURL: 'https://img/u1' });
  });

  it('+ skips the auth profile when nobody is signed in', async () => {
    await uploadProfileImage('u1', 'file:///photo.jpg');
    expect(fs.updateDoc).toHaveBeenCalled();
    expect(fa.updateProfile).not.toHaveBeenCalled();
  });

  it('− does not upload anything if the local file cannot be read', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(uploadProfileImage('u1', 'file:///missing.jpg')).rejects.toThrow('ENOENT');
    expect(st.uploadBytes).not.toHaveBeenCalled();
    expect(fs.updateDoc).not.toHaveBeenCalled();
  });

  it('− does not record a URL if the upload fails', async () => {
    st.uploadBytes.mockRejectedValueOnce(failure('storage/unauthorized'));
    await expect(uploadProfileImage('u1', 'file:///photo.jpg')).rejects.toMatchObject({ code: 'storage/unauthorized' });
    expect(st.getDownloadURL).not.toHaveBeenCalled();
    expect(fs.updateDoc).not.toHaveBeenCalled();
  });
});

describe('signIn', () => {
  it('+ returns the signed-in user', async () => {
    fa.signInWithEmailAndPassword.mockResolvedValue({ user: USER } as any);
    await expect(signIn('kai@example.com', 'secret1')).resolves.toBe(USER);
    expect(fa.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'kai@example.com', 'secret1');
  });

  it.each(['auth/invalid-credential', 'auth/invalid-email', 'auth/too-many-requests', 'auth/network-request-failed'])(
    '− propagates %s so the login screen can show it', async (code) => {
      fa.signInWithEmailAndPassword.mockRejectedValueOnce(failure(code));
      await expect(signIn('kai@example.com', 'bad')).rejects.toMatchObject({ code });
    });
});

describe('createUserAccount', () => {
  it('+ registers, sets the display name, and returns the user', async () => {
    fa.createUserWithEmailAndPassword.mockResolvedValue({ user: USER } as any);
    await expect(createUserAccount('kai@example.com', 'secret1', 'Kai')).resolves.toBe(USER);
    expect(fa.createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, 'kai@example.com', 'secret1');
    expect(fa.updateProfile).toHaveBeenCalledWith(USER, { displayName: 'Kai' });
  });

  it.each(['auth/email-already-in-use', 'auth/weak-password', 'auth/invalid-email'])(
    '− propagates %s and never sets a display name', async (code) => {
      fa.createUserWithEmailAndPassword.mockRejectedValueOnce(failure(code));
      await expect(createUserAccount('kai@example.com', 'x', 'Kai')).rejects.toMatchObject({ code });
      expect(fa.updateProfile).not.toHaveBeenCalled();
    });

  it('− propagates a failure to set the display name', async () => {
    fa.createUserWithEmailAndPassword.mockResolvedValue({ user: USER } as any);
    fa.updateProfile.mockRejectedValueOnce(failure('auth/network-request-failed'));
    await expect(createUserAccount('kai@example.com', 'secret1', 'Kai')).rejects.toMatchObject({ code: 'auth/network-request-failed' });
  });
});

describe('changePassword', () => {
  it('+ reauthenticates with the current password, then sets the new one', async () => {
    auth.currentUser = { ...USER };
    await changePassword('old-pass', 'new-pass');

    expect(fa.EmailAuthProvider.credential).toHaveBeenCalledWith('kai@example.com', 'old-pass');
    expect(fa.reauthenticateWithCredential).toHaveBeenCalledWith(auth.currentUser, { email: 'kai@example.com', password: 'old-pass' });
    expect(fa.updatePassword).toHaveBeenCalledWith(auth.currentUser, 'new-pass');
    // Order matters: Firebase rejects updatePassword without a recent login.
    expect(fa.reauthenticateWithCredential.mock.invocationCallOrder[0])
      .toBeLessThan(fa.updatePassword.mock.invocationCallOrder[0]);
  });

  it('− does nothing when nobody is signed in', async () => {
    await expect(changePassword('a', 'b')).resolves.toBeUndefined();
    expect(fa.reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(fa.updatePassword).not.toHaveBeenCalled();
  });

  it('− does nothing for an account without an email', async () => {
    auth.currentUser = { ...USER, email: null as any };
    await changePassword('a', 'b');
    expect(fa.reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it('− never changes the password when the current one is wrong', async () => {
    auth.currentUser = { ...USER };
    fa.reauthenticateWithCredential.mockRejectedValueOnce(failure('auth/invalid-credential'));
    await expect(changePassword('wrong', 'new-pass')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(fa.updatePassword).not.toHaveBeenCalled();
  });

  it('− propagates a rejected new password', async () => {
    auth.currentUser = { ...USER };
    fa.updatePassword.mockRejectedValueOnce(failure('auth/weak-password'));
    await expect(changePassword('old-pass', '1')).rejects.toMatchObject({ code: 'auth/weak-password' });
  });
});

describe('signOutUser', () => {
  it('+ signs out of Firebase auth', async () => {
    await signOutUser();
    expect(fa.signOut).toHaveBeenCalledWith(auth);
  });

  it('− propagates a sign-out failure', async () => {
    fa.signOut.mockRejectedValueOnce(failure('auth/network-request-failed'));
    await expect(signOutUser()).rejects.toMatchObject({ code: 'auth/network-request-failed' });
  });
});
