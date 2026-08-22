import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';

// The shape a placed item takes once persisted to Firestore. Render-only fields
// (image, isTall, gridWidth/gridHeight) are rehydrated from INVENTORY_ITEMS by
// the garden screen and are deliberately not stored.
export type PlacedItem = {
  instanceId: string;
  catalogId: string;
  col: number;
  row: number;
};

/** All gardens owned by a user, as full documents plus their id. */
export const getUserGardens = async (uid: string) => {
  const gardensRef = collection(db, 'gardens');
  const q = query(gardensRef, where('OwnerId', '==', uid));
  const gardensSnap = await getDocs(q);

  return gardensSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as ({ id: string } & Record<string, any>)[];
};

/** A single garden document, or null if it no longer exists. */
export const getGarden = async (gardenId: string) => {
  const gardenSnap = await getDoc(doc(db, 'gardens', gardenId));
  return gardenSnap.exists() ? gardenSnap.data() : null;
};

/** Creates an empty garden for a user and returns its new document id. */
export const createGarden = async (uid: string, name: string): Promise<string> => {
  const newGardenRef = await addDoc(collection(db, 'gardens'), {
    OwnerId: uid,
    GardenTheme: name,
    TotalEntities: 0,
    PlacedItems: [],
    CreatedAt: serverTimestamp(),
  });

  return newGardenRef.id;
};

/**
 * Persists a garden's layout. Accepts the screen's runtime items and strips them
 * down to the stored shape, so callers don't need to know the persistence format.
 */
export const saveGardenItems = async (gardenId: string, items: any[]) => {
  const firestoreItems: PlacedItem[] = items.map((item) => ({
    instanceId: item.id,
    catalogId: item.catalogId,
    col: item.col,
    row: item.row,
  }));

  await updateDoc(doc(db, 'gardens', gardenId), {
    PlacedItems: firestoreItems,
    TotalEntities: firestoreItems.length,
  });
};

export const deleteGarden = async (gardenId: string) => {
  await deleteDoc(doc(db, 'gardens', gardenId));
};
