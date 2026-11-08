/**
 * Self-tests for the strict fake Firebase. The integration and E2E suites lean
 * on it behaving like the real thing, so its strictness is pinned here.
 */
import { FakeTimestamp, authApi, firestore as fs, peekDoc, resetFakeFirebase, storageApi, auth } from '../helpers/fakeFirebase';

beforeEach(resetFakeFirebase);

describe('fake Firestore', () => {
  const db = {};
  const ref = () => fs.doc(db, 'things', 'a');

  it('rejects undefined at the top level and nested inside arrays/objects', async () => {
    await expect(fs.setDoc(ref(), { a: undefined })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(fs.setDoc(ref(), { list: [{ ok: 1 }, { bad: undefined }] })).rejects.toMatchObject({ code: 'invalid-argument' });
    await fs.setDoc(ref(), { ok: 1 });
    await expect(fs.updateDoc(ref(), { deep: { bad: undefined } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('allows null', async () => {
    await expect(fs.setDoc(ref(), { a: null })).resolves.toBeUndefined();
  });

  it('fails updateDoc on a missing document with not-found', async () => {
    await expect(fs.updateDoc(ref(), { a: 1 })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects non-object payloads', async () => {
    await expect(fs.setDoc(ref(), [] as any)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(fs.setDoc(ref(), null as any)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('isolates stored data from the caller (deep clone both ways)', async () => {
    const data = { list: [{ n: 1 }] };
    await fs.setDoc(ref(), data);
    data.list[0].n = 99;
    const read = (await fs.getDoc(ref())).data()!;
    (read.list as any)[0].n = 42;
    expect(peekDoc('things/a')).toEqual({ list: [{ n: 1 }] });
  });

  it('merges updates shallowly and resolves serverTimestamp', async () => {
    await fs.setDoc(ref(), { a: 1, b: 2 });
    await fs.updateDoc(ref(), { b: 3, at: fs.serverTimestamp() });
    const data = peekDoc('things/a')!;
    expect(data).toMatchObject({ a: 1, b: 3 });
    expect(data.at).toBeInstanceOf(FakeTimestamp);
  });

  it('filters queries by equality and ignores other collections', async () => {
    await fs.setDoc(fs.doc(db, 'gardens', 'g1'), { OwnerId: 'u1' });
    await fs.setDoc(fs.doc(db, 'gardens', 'g2'), { OwnerId: 'u2' });
    await fs.setDoc(fs.doc(db, 'other', 'x'), { OwnerId: 'u1' });
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'gardens'), fs.where('OwnerId', '==', 'u1')));
    expect(snap.docs.map(d => d.id)).toEqual(['g1']);
  });

  it('refuses query operators it does not implement, rather than silently ignoring them', () => {
    expect(() => fs.where('n', '>', 1)).toThrow();
  });

  it('deleting a missing document is not an error', async () => {
    await expect(fs.deleteDoc(ref())).resolves.toBeUndefined();
  });

  it('refuses an empty document id', () => {
    expect(() => fs.doc(db, 'things', '')).toThrow();
  });
});

describe('fake Auth', () => {
  it('enforces email format, password length, and unique (case-insensitive) emails', async () => {
    await expect(authApi.createUserWithEmailAndPassword(auth, 'not-an-email', 'secret1')).rejects.toMatchObject({ code: 'auth/invalid-email' });
    await expect(authApi.createUserWithEmailAndPassword(auth, 'a@b.co', '12345')).rejects.toMatchObject({ code: 'auth/weak-password' });
    await authApi.createUserWithEmailAndPassword(auth, 'a@b.co', 'secret1');
    await expect(authApi.createUserWithEmailAndPassword(auth, 'A@B.CO', 'secret1')).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
  });

  it('reports unknown users and wrong passwords identically', async () => {
    await authApi.createUserWithEmailAndPassword(auth, 'a@b.co', 'secret1');
    await expect(authApi.signInWithEmailAndPassword(auth, 'a@b.co', 'wrong!')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await expect(authApi.signInWithEmailAndPassword(auth, 'x@y.co', 'secret1')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
  });

  it('tracks the signed-in user', async () => {
    const { user } = await authApi.createUserWithEmailAndPassword(auth, 'a@b.co', 'secret1');
    expect(auth.currentUser).toBe(user);
    await authApi.signOut();
    expect(auth.currentUser).toBeNull();
  });
});

describe('fake Storage', () => {
  it('only issues download URLs for files that exist', async () => {
    const r = storageApi.ref({}, 'profileImages/u1');
    await expect(storageApi.getDownloadURL(r)).rejects.toMatchObject({ code: 'storage/object-not-found' });
    await storageApi.uploadBytes(r, { bytes: 1 });
    await expect(storageApi.getDownloadURL(r)).resolves.toContain('profileImages');
  });
});
