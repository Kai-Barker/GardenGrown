/**
 * A strict, in-memory stand-in for the slice of the Firebase SDK the app uses.
 *
 * The suite is deliberately mocks-only (no emulator), so this fake carries the
 * real-Firebase behaviour the app's code depends on — the things a naive
 * `jest.fn()` would happily accept and a real backend would not:
 *
 *   - Firestore rejects `undefined` anywhere in a payload (`invalid-argument`).
 *     This is why PlantObject.toData() omits an unset stageStartedAt.
 *   - updateDoc on a missing document fails with `not-found`.
 *   - Reads and writes deep-clone, so mutating an object after saving it can't
 *     leak into "the database" (and vice versa).
 *   - serverTimestamp() resolves to a Timestamp-like value on write.
 *   - Auth enforces unique emails (case-insensitive), a 6-character minimum
 *     password, a valid email format, and returns Firebase's real error codes.
 *
 * Wire it in from a test file with:
 *
 *   jest.mock('firebase/firestore', () => require('../helpers/fakeFirebase').firestore);
 *   jest.mock('firebase/auth', () => require('../helpers/fakeFirebase').authApi);
 *   jest.mock('firebase/storage', () => require('../helpers/fakeFirebase').storageApi);
 *
 * The app's own `firebase.js` is mapped to `firebaseModule` for every test in
 * helpers/setup.ts, so `auth.currentUser` here is the one the services read.
 */

/* ERRORS
=================================================== */

export class FakeFirebaseError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'FirebaseError';
    this.code = code;
  }
}

/* STATE
=================================================== */

export type FakeUser = {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
};

type Account = { user: FakeUser; password: string };

const state = {
  docs: new Map<string, Record<string, unknown>>(),
  accounts: new Map<string, Account>(),
  files: new Map<string, unknown>(),
  nextId: 1,
};

/** The object the app's firebase.js `auth` export is mapped to. */
export const auth: { currentUser: FakeUser | null } = { currentUser: null };
export const db = { __fake: 'firestore' as const };
export const storage = { __fake: 'storage' as const };

/** Stand-in for the app's firebase.js module. */
export const firebaseModule = { auth, db, storage };

/** Wipes every collection, account and file, and signs out. Call in beforeEach. */
export const resetFakeFirebase = () => {
  state.docs.clear();
  state.accounts.clear();
  state.files.clear();
  state.nextId = 1;
  auth.currentUser = null;
};

/** Raw read of a stored document, for assertions. */
export const peekDoc = (path: string) => {
  const data = state.docs.get(path);
  return data === undefined ? undefined : clone(data);
};

/** Every stored document path, for assertions. */
export const allDocPaths = () => [...state.docs.keys()];

/** Whether a file exists in fake storage. */
export const hasFile = (path: string) => state.files.has(path);

/* HELPERS
=================================================== */

const SERVER_TIMESTAMP = Symbol('serverTimestamp');

export class FakeTimestamp {
  constructor(readonly millis: number) {}
  toMillis() { return this.millis; }
  toDate() { return new Date(this.millis); }
}

const clone = <T>(value: T): T => {
  if (value instanceof FakeTimestamp) return new FakeTimestamp(value.millis) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out as T;
  }
  return value;
};

/** Firestore's own rule: `undefined` is not a storable value, at any depth. */
const assertNoUndefined = (value: unknown, fn: string, path = '') => {
  if (value === undefined) {
    throw new FakeFirebaseError(
      'invalid-argument',
      `Function ${fn}() called with invalid data. Unsupported field value: undefined (found in field ${path || '<root>'})`,
    );
  }
  if (value instanceof FakeTimestamp || (value as any) === SERVER_TIMESTAMP) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoUndefined(v, fn, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, fn, path ? `${path}.${k}` : k);
  }
};

/** Replaces serverTimestamp() sentinels with a concrete timestamp, as the server would. */
const resolveSentinels = (data: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = (v as any) === SERVER_TIMESTAMP ? new FakeTimestamp(Date.now()) : clone(v);
  }
  return out;
};

const assertPlainData = (data: unknown, fn: string) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new FakeFirebaseError('invalid-argument', `Function ${fn}() requires its data argument to be an object`);
  }
};

/* FIRESTORE
=================================================== */

type DocRef = { type: 'document'; path: string; id: string };
type CollectionRef = { type: 'collection'; path: string };
type Constraint = { field: string; op: string; value: unknown };
type Query = { type: 'query'; path: string; constraints: Constraint[] };

const snapshot = (ref: DocRef) => {
  const data = state.docs.get(ref.path);
  return {
    id: ref.id,
    ref,
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : clone(data)),
  };
};

export const firestore = {
  doc: (_db: unknown, collectionPath: string, id: string): DocRef => {
    if (!id) throw new FakeFirebaseError('invalid-argument', 'Document id must be a non-empty string');
    return { type: 'document', path: `${collectionPath}/${id}`, id };
  },

  collection: (_db: unknown, path: string): CollectionRef => ({ type: 'collection', path }),

  where: (field: string, op: string, value: unknown): Constraint => {
    if (op !== '==') throw new Error(`fakeFirebase: where() operator "${op}" is not implemented`);
    return { field, op, value };
  },

  query: (ref: CollectionRef, ...constraints: Constraint[]): Query => ({
    type: 'query',
    path: ref.path,
    constraints,
  }),

  serverTimestamp: () => SERVER_TIMESTAMP,

  getDoc: async (ref: DocRef) => snapshot(ref),

  getDocs: async (q: Query | CollectionRef) => {
    const constraints = q.type === 'query' ? q.constraints : [];
    const prefix = `${q.path}/`;

    const docs = [...state.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .filter(([, data]) => constraints.every(c => data[c.field] === c.value))
      .map(([path]) => snapshot({ type: 'document', path, id: path.slice(prefix.length) }));

    return { docs, empty: docs.length === 0, size: docs.length };
  },

  setDoc: async (ref: DocRef, data: Record<string, unknown>) => {
    assertPlainData(data, 'setDoc');
    assertNoUndefined(data, 'setDoc');
    state.docs.set(ref.path, resolveSentinels(data));
  },

  updateDoc: async (ref: DocRef, data: Record<string, unknown>) => {
    assertPlainData(data, 'updateDoc');
    const existing = state.docs.get(ref.path);
    if (existing === undefined) {
      throw new FakeFirebaseError('not-found', `No document to update: ${ref.path}`);
    }
    assertNoUndefined(data, 'updateDoc');
    state.docs.set(ref.path, { ...existing, ...resolveSentinels(data) });
  },

  // Like the real SDK, deleting a document that doesn't exist is not an error.
  deleteDoc: async (ref: DocRef) => {
    state.docs.delete(ref.path);
  },

  addDoc: async (ref: CollectionRef, data: Record<string, unknown>) => {
    const id = `auto${state.nextId++}`;
    const docRef: DocRef = { type: 'document', path: `${ref.path}/${id}`, id };
    await firestore.setDoc(docRef, data);
    return docRef;
  },
};

/* AUTH
=================================================== */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normaliseEmail = (email: string) => email.trim().toLowerCase();

const accountFor = (user: FakeUser) => state.accounts.get(normaliseEmail(user.email));

export const authApi = {
  createUserWithEmailAndPassword: async (_auth: unknown, email: string, password: string) => {
    if (!EMAIL_PATTERN.test(email ?? '')) throw new FakeFirebaseError('auth/invalid-email');
    if ((password ?? '').length < 6) throw new FakeFirebaseError('auth/weak-password');

    const key = normaliseEmail(email);
    if (state.accounts.has(key)) throw new FakeFirebaseError('auth/email-already-in-use');

    const user: FakeUser = { uid: `uid${state.nextId++}`, email: key, displayName: null, photoURL: null };
    state.accounts.set(key, { user, password });
    auth.currentUser = user;
    return { user };
  },

  // Modern Firebase (email-enumeration protection) reports both "no such user"
  // and "wrong password" as auth/invalid-credential.
  signInWithEmailAndPassword: async (_auth: unknown, email: string, password: string) => {
    if (!EMAIL_PATTERN.test(email ?? '')) throw new FakeFirebaseError('auth/invalid-email');

    const account = state.accounts.get(normaliseEmail(email));
    if (!account || account.password !== password) throw new FakeFirebaseError('auth/invalid-credential');

    auth.currentUser = account.user;
    return { user: account.user };
  },

  updateProfile: async (user: FakeUser, profile: { displayName?: string | null; photoURL?: string | null }) => {
    if (profile.displayName !== undefined) user.displayName = profile.displayName;
    if (profile.photoURL !== undefined) user.photoURL = profile.photoURL;
  },

  updatePassword: async (user: FakeUser, newPassword: string) => {
    if ((newPassword ?? '').length < 6) throw new FakeFirebaseError('auth/weak-password');
    const account = accountFor(user);
    if (!account) throw new FakeFirebaseError('auth/user-not-found');
    account.password = newPassword;
  },

  EmailAuthProvider: {
    credential: (email: string, password: string) => ({ providerId: 'password', email, password }),
  },

  reauthenticateWithCredential: async (user: FakeUser, credential: { email: string; password: string }) => {
    const account = accountFor(user);
    if (
      !account ||
      normaliseEmail(credential.email) !== normaliseEmail(user.email) ||
      account.password !== credential.password
    ) {
      throw new FakeFirebaseError('auth/invalid-credential');
    }
    return { user };
  },

  signOut: async () => {
    auth.currentUser = null;
  },
};

/* STORAGE
=================================================== */

type StorageRef = { fullPath: string };

export const storageApi = {
  ref: (_storage: unknown, path: string): StorageRef => ({ fullPath: path }),

  uploadBytes: async (ref: StorageRef, data: unknown) => {
    if (data === undefined || data === null) throw new FakeFirebaseError('storage/invalid-argument');
    state.files.set(ref.fullPath, data);
    return { ref, metadata: { fullPath: ref.fullPath } };
  },

  getDownloadURL: async (ref: StorageRef) => {
    if (!state.files.has(ref.fullPath)) throw new FakeFirebaseError('storage/object-not-found');
    return `https://fake.storage.test/${encodeURIComponent(ref.fullPath)}`;
  },
};
