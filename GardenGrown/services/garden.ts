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
import type { PlacedObject } from '../components/Garden/objects';
import type { PlacedObjectData, TerrainMap } from '../components/Garden/types';

// The shape a placed item takes once persisted to Firestore. Render-only fields
// (image, isTall, gridWidth/gridHeight) are rehydrated from the catalog by the
// garden screen and are deliberately not stored.
export type PlacedItem = PlacedObjectData;

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
    Terrain: {},
    CreatedAt: serverTimestamp(),
  });

  return newGardenRef.id;
};

/**
 * Persists a garden's layout — the objects placed on it and the terrain painted
 * under them. Each object serialises itself, so callers don't need to know the
 * persistence format and new object kinds can carry extra state without this
 * function changing.
 *
 * Terrain is stored as a flat "col,row" -> terrain id map rather than in the
 * items array, so painting a cell is a single-key write and terrain never
 * competes with objects for occupancy.
 */
export const saveGardenLayout = async (
  gardenId: string,
  objects: PlacedObject[],
  terrain: TerrainMap,
) => {
  const firestoreItems: PlacedItem[] = objects.map((object) => object.toData());

  await updateDoc(doc(db, 'gardens', gardenId), {
    PlacedItems: firestoreItems,
    Terrain: terrain,
    TotalEntities: firestoreItems.length,
  });
};

export const deleteGarden = async (gardenId: string) => {
  await deleteDoc(doc(db, 'gardens', gardenId));
};
