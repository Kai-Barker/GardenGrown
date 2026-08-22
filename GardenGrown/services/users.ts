import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';

/* FIRESTORE
=================================================== */

/** A user's profile document, or null if it doesn't exist yet. */
export const getUserProfile = async (uid: string) => {
  const userSnap = await getDoc(doc(db, 'users', uid));
  return userSnap.exists() ? userSnap.data() : null;
};

/** Creates the Firestore record that backs a newly registered account. */
export const createUserDocument = async (
  uid: string,
  { username, email }: { username: string; email: string }
) => {
  await setDoc(doc(db, 'users', uid), {
    Username: username,
    Email: email,
    AccountCreated: serverTimestamp(),
    ProfileImageURI: null,
  });
};

/** Updates the username in Firestore and keeps the auth displayName in sync. */
export const updateUsername = async (uid: string, name: string) => {
  await updateDoc(doc(db, 'users', uid), {
    Username: name,
  });

  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: name });
  }
};

/* STORAGE
=================================================== */

/**
 * Uploads a locally-picked image as the user's profile photo, records the
 * resulting URL on both the Firestore document and the auth profile, and
 * returns that URL. Uploading to a fixed per-user path replaces any previous
 * photo rather than orphaning it.
 */
export const uploadProfileImage = async (uid: string, localUri: string): Promise<string> => {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const imageRef = ref(storage, `profileImages/${uid}`);
  await uploadBytes(imageRef, blob);
  const downloadURL = await getDownloadURL(imageRef);

  await updateDoc(doc(db, 'users', uid), {
    ProfileImageURI: downloadURL,
  });

  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { photoURL: downloadURL });
  }

  return downloadURL;
};

/* AUTH
=================================================== */

export const signIn = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

/** Registers an account and sets its displayName, returning the new user. */
export const createUserAccount = async (
  email: string,
  password: string,
  username: string
): Promise<User> => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(userCredential.user, { displayName: username });
  return userCredential.user;
};

/** Reauthenticates with the current password before setting the new one. */
export const changePassword = async (currentPassword: string, newPassword: string) => {
  const user = auth.currentUser;
  if (!user || !user.email) return;

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
};

export const signOutUser = async () => {
  await signOut(auth);
};
