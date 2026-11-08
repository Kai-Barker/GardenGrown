/**
 * End-to-end journeys: complete user stories through every layer below the UI
 * — auth, profile, onboarding, garden CRUD, the placement rules driven from
 * screen touches, growth over time, and persistence across sign-out/sign-in.
 *
 * Firebase is the strict in-memory fake; AsyncStorage is the official mock.
 */
jest.mock('firebase/firestore', () => require('../helpers/fakeFirebase').firestore);
jest.mock('firebase/auth', () => require('../helpers/fakeFirebase').authApi);
jest.mock('firebase/storage', () => require('../helpers/fakeFirebase').storageApi);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLUMNS, ROWS, TOTAL_CELLS } from '../../components/Garden/constants';
import { PlantObject } from '../../components/Garden/objects';
import { createGarden, deleteGarden, getUserGardens } from '../../services/garden';
import { hasCompletedOnboarding, setOnboardingComplete } from '../../services/onboarding';
import {
  changePassword,
  createUserAccount,
  createUserDocument,
  getUserProfile,
  signIn,
  signOutUser,
  updateUsername,
} from '../../services/users';
import { auth, resetFakeFirebase } from '../helpers/fakeFirebase';
import { IDS, MINUTE, NOW } from '../helpers/factories';
import { GardenSession } from '../helpers/gardenSession';

const EMAIL = 'gardener@example.com';
const PASSWORD = 'hunter22';

const signUp = async (email = EMAIL, username = 'Gardener') => {
  const user = await createUserAccount(email, PASSWORD, username);
  await createUserDocument(user.uid, { username, email });
  return user;
};

beforeEach(async () => {
  resetFakeFirebase();
  await AsyncStorage.clear();
});

describe('Journey 1: a new gardener builds a garden, signs out, and finds it intact', () => {
  it('runs end to end', async () => {
    // First launch: the tour shows, then is marked done.
    await expect(hasCompletedOnboarding()).resolves.toBe(false);
    await setOnboardingComplete();
    await expect(hasCompletedOnboarding()).resolves.toBe(true);

    // Sign up.
    const { uid } = await signUp();
    await expect(getUserProfile(uid)).resolves.toMatchObject({ Username: 'Gardener' });

    // Create a garden and open it.
    const gardenId = await createGarden(uid, 'Backyard');
    const garden = await new GardenSession(gardenId, NOW).open();
    expect(garden.name).toBe('Backyard');

    // Plant a rose, an oak (1x2) and a rock.
    const rose = await garden.dropFromInventory(IDS.ROSE, 1, 1);
    garden.now += 1;
    const oak = await garden.dropFromInventory(IDS.OAK, 4, 4); // covers (4,4)-(4,5)
    garden.now += 1;
    const rock = await garden.dropFromInventory(IDS.ROCK, 6, 10);
    expect([rose, oak, rock].every(r => typeof r === 'object')).toBe(true);

    // Dropping onto the oak's lower cell is refused — and the highlight said so.
    expect(garden.highlight(IDS.ROCK, 4, 5)).toEqual({ col: 4, row: 5, valid: false });
    await expect(garden.dropFromInventory(IDS.ROCK, 4, 5)).resolves.toBe('blocked');

    // Move the rock somewhere free; moving it onto the oak is refused.
    const rockId = (rock as PlantObject).instanceId;
    await expect(garden.move(rockId, 4, 4)).resolves.toBe('blocked');
    await expect(garden.move(rockId, 0, 15)).resolves.toEqual({ col: 0, row: 15 });

    // Paint grass under the rose (terrain never collides), then a water tile.
    await expect(garden.dropFromInventory(IDS.GRASS, 1, 1)).resolves.toBe('painted');
    await expect(garden.dropFromInventory(IDS.WATER, 2, 1)).resolves.toBe('painted');
    await expect(garden.dropFromInventory(IDS.WATER, 2, 1)).resolves.toBe('unchanged');
    await expect(garden.dropFromInventory(IDS.ERASER, 2, 1)).resolves.toBe('painted');

    const before = garden.layout();

    // Sign out, sign back in, reopen: everything is where it was left.
    await signOutUser();
    expect(auth.currentUser).toBeNull();
    await signIn(EMAIL, PASSWORD);
    const [listed] = await getUserGardens(auth.currentUser!.uid);
    expect(listed).toMatchObject({ id: gardenId, GardenTheme: 'Backyard', TotalEntities: 3 });

    const reopened = await new GardenSession(gardenId, NOW + 10).open();
    expect(reopened.layout()).toEqual(before);
    expect(reopened.terrain).toEqual({ '1,1': 'grass' });
  });
});

describe('Journey 2: growing an oak from seed to tree', () => {
  it('needs two waterings, survives a reload mid-way, and refuses water once grown', async () => {
    const { uid } = await signUp();
    const gardenId = await createGarden(uid, 'Grove');
    let garden = await new GardenSession(gardenId, NOW).open();

    const oak = (await garden.dropFromInventory(IDS.OAK, 3, 3)) as PlantObject;
    expect(oak.isThirsty).toBe(true);
    expect(garden.highlight('can', 3, 4)).toMatchObject({ valid: true }); // either cell of the oak

    // Nothing happens without water.
    garden.now += 60 * MINUTE;
    await expect(garden.tick()).resolves.toBe(false);

    // Water it; it grows into a sapling a minute later.
    await expect(garden.waterAt(3, 4)).resolves.toBe(true);
    await expect(garden.waterAt(3, 3)).resolves.toBe(false); // already growing
    expect(garden.highlight('can', 3, 3)).toMatchObject({ valid: false });

    garden.now += MINUTE;
    await expect(garden.tick()).resolves.toBe(true);
    expect((garden.items[0] as PlantObject).growthStage).toBe(1);

    // Close the app and come back: still a thirsty sapling.
    garden = await new GardenSession(gardenId, garden.now + 30 * MINUTE).open();
    const sapling = garden.items[0] as PlantObject;
    expect([sapling.growthStage, sapling.isThirsty]).toEqual([1, true]);

    // Second watering, and the app is closed while it finishes growing.
    await expect(garden.waterAt(3, 3)).resolves.toBe(true);
    garden = await new GardenSession(gardenId, garden.now + MINUTE).open();
    const tree = garden.items[0] as PlantObject;
    expect(tree.isMature).toBe(true);

    // A mature tree can't be watered.
    expect(garden.highlight('can', 3, 3)).toMatchObject({ valid: false });
    await expect(garden.waterAt(3, 3)).resolves.toBe(false);
  });
});

describe('Journey 3: managing several gardens', () => {
  it('keeps gardens separate, and deleting one leaves the rest', async () => {
    const { uid } = await signUp();
    const front = await createGarden(uid, 'Front');
    const back = await createGarden(uid, 'Back');

    const frontGarden = await new GardenSession(front, NOW).open();
    await frontGarden.dropFromInventory(IDS.ROSE, 0, 0);
    const backGarden = await new GardenSession(back, NOW).open();
    await backGarden.dropFromInventory(IDS.LANTERN, 7, 15);

    // Another user's garden never shows up in this list.
    await signOutUser();
    const other = await signUp('neighbour@example.com', 'Neighbour');
    await createGarden(other.uid, 'Next door');

    expect((await getUserGardens(uid)).map(g => g.GardenTheme).sort()).toEqual(['Back', 'Front']);

    await deleteGarden(front);
    expect((await getUserGardens(uid)).map(g => g.id)).toEqual([back]);
    await expect(new GardenSession(front, NOW).open()).rejects.toThrow('does not exist');

    const stillThere = await new GardenSession(back, NOW).open();
    expect(stillThere.items.map(i => i.entry.id)).toEqual([IDS.LANTERN]);
  });
});

describe('Journey 4: account settings', () => {
  it('renames the user and changes the password, refusing a wrong current password', async () => {
    const { uid } = await signUp();

    await updateUsername(uid, 'Head Gardener');
    await expect(getUserProfile(uid)).resolves.toMatchObject({ Username: 'Head Gardener' });
    expect(auth.currentUser?.displayName).toBe('Head Gardener');

    await expect(changePassword('not-it', 'new-password')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await changePassword(PASSWORD, 'new-password');

    await signOutUser();
    await expect(signIn(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await expect(signIn(EMAIL, 'new-password')).resolves.toMatchObject({ displayName: 'Head Gardener' });
  });
});

describe('Journey 5: filling the garden to the last cell', () => {
  it('accepts exactly 128 rocks, then refuses a drop anywhere', async () => {
    const { uid } = await signUp();
    const gardenId = await createGarden(uid, 'Quarry');
    const garden = await new GardenSession(gardenId, NOW).open();

    for (let c = 0; c < COLUMNS; c++) {
      for (let r = 0; r < ROWS; r++) {
        garden.now += 1;
        expect(typeof (await garden.dropFromInventory(IDS.ROCK, c, r))).toBe('object');
      }
    }
    expect(garden.items).toHaveLength(TOTAL_CELLS);
    expect(new Set(garden.items.map(i => i.instanceId)).size).toBe(TOTAL_CELLS);

    for (const [c, r] of [[0, 0], [3, 8], [COLUMNS - 1, ROWS - 1]]) {
      await expect(garden.dropFromInventory(IDS.ROSE, c, r)).resolves.toBe('blocked');
      await expect(garden.dropFromInventory(IDS.OAK, c, r)).resolves.toBe('blocked');
    }

    // Terrain can still be painted underneath everything.
    await expect(garden.dropFromInventory(IDS.SAND, 3, 8)).resolves.toBe('painted');

    // Clearing one cell makes exactly that cell available again.
    const victim = garden.items.find(i => i.col === 5 && i.row === 5)!;
    await garden.remove(victim.instanceId);
    expect(garden.highlight(IDS.ROSE, 5, 5)).toEqual({ col: 5, row: 5, valid: true });
    expect(garden.highlight(IDS.ROSE, 5, 6)).toEqual({ col: 5, row: 6, valid: false });

    const reopened = await new GardenSession(gardenId, garden.now).open();
    expect(reopened.items).toHaveLength(TOTAL_CELLS - 1);
  });
});

describe('Journey 6: placing while zoomed in', () => {
  it('drops land on the cell under the finger at 2x and 3x zoom', async () => {
    const { uid } = await signUp();
    const gardenId = await createGarden(uid, 'Zoomed');
    const garden = await new GardenSession(gardenId, NOW).open();

    garden.zoom = 2;
    garden.rect = { ...garden.rect, pageX: -200, pageY: -650 };
    const a = (await garden.dropFromInventory(IDS.ROSE, 6, 12)) as PlantObject;
    expect([a.col, a.row]).toEqual([6, 12]);

    garden.zoom = 3;
    garden.rect = { ...garden.rect, pageX: -900, pageY: -2400 };
    garden.now += 1;
    const b = (await garden.dropFromInventory(IDS.OAK, 7, 15)) as PlantObject;
    expect([b.col, b.row]).toEqual([7, 14]); // pulled up so both cells fit
  });
});
