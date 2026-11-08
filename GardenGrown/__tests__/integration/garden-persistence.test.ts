/**
 * Integration: the placement rules, the object model and the garden service,
 * working together against the strict fake Firestore.
 *
 * These follow the same path the garden screen does — resolve a drop, apply it,
 * save the layout, load it back with parseGardenDoc — without rendering.
 */
jest.mock('firebase/firestore', () => require('../helpers/fakeFirebase').firestore);

import { PlantObject, type PlacedObject } from '../../components/Garden/objects';
import {
  applyTerrainPaint,
  parseGardenDoc,
  resolveCatalogDrop,
} from '../../components/Garden/placement';
import type { TerrainMap } from '../../components/Garden/types';
import { createGarden, deleteGarden, getGarden, getUserGardens, saveGardenLayout } from '../../services/garden';
import { FakeTimestamp, peekDoc, resetFakeFirebase } from '../helpers/fakeFirebase';
import { IDS, MINUTE, NOW, entry } from '../helpers/factories';

beforeEach(resetFakeFirebase);

/** Drops a catalog item the way handleInventoryDragEnd does; returns the new list. */
const drop = (items: PlacedObject[], id: string, col: number, row: number, now = NOW) => {
  const result = resolveCatalogDrop(entry(id), items, col, row, now);
  if (result.type !== 'place') throw new Error(`Expected a placement at ${col},${row}, got ${result.type}`);
  return [...items, result.item];
};

const reload = async (gardenId: string, now = NOW) => {
  const data = await getGarden(gardenId);
  if (!data) throw new Error('garden vanished');
  return parseGardenDoc(data, now);
};

describe('creating a garden', () => {
  it('+ starts empty, owned by its creator, with a server timestamp', async () => {
    const id = await createGarden('u1', 'Zen');
    expect(peekDoc(`gardens/${id}`)).toMatchObject({ OwnerId: 'u1', GardenTheme: 'Zen', PlacedItems: [], Terrain: {}, TotalEntities: 0 });
    expect(peekDoc(`gardens/${id}`)!.CreatedAt).toBeInstanceOf(FakeTimestamp);

    const loaded = await reload(id);
    expect(loaded).toEqual({ name: 'Zen', items: [], terrain: {} });
  });
});

describe('save -> reload round trip', () => {
  it('+ keeps every object\'s kind, position and growth state', async () => {
    const id = await createGarden('u1', 'Zen');
    let items: PlacedObject[] = [];
    items = drop(items, IDS.ROSE, 0, 0, NOW);
    items = drop(items, IDS.OAK, 2, 2, NOW + 1);
    items = drop(items, IDS.ROCK, 7, 15, NOW + 2);
    (items[1] as PlantObject).water(NOW + 3);

    await saveGardenLayout(id, items, {});
    const loaded = await reload(id, NOW + 4);

    expect(loaded.items.map(i => i.toData())).toEqual(items.map(i => i.toData()));
    expect(peekDoc(`gardens/${id}`)!.TotalEntities).toBe(3);
  });

  it('+ saving a thirsty plant succeeds (no undefined reaches Firestore)', async () => {
    const id = await createGarden('u1', 'Zen');
    const items = drop([], IDS.ROSE, 1, 1);
    expect((items[0] as PlantObject).isThirsty).toBe(true);
    await expect(saveGardenLayout(id, items, {})).resolves.toBeUndefined();
  });

  it('+ keeps terrain, including erased cells staying erased', async () => {
    const id = await createGarden('u1', 'Zen');
    let terrain: TerrainMap = {};
    terrain = applyTerrainPaint(terrain, IDS.GRASS, 0, 0);
    terrain = applyTerrainPaint(terrain, IDS.WATER, 1, 0);
    terrain = applyTerrainPaint(terrain, IDS.SAND, 2, 0);
    terrain = applyTerrainPaint(terrain, IDS.ERASER, 1, 0);

    await saveGardenLayout(id, [], terrain);
    expect((await reload(id)).terrain).toEqual({ '0,0': 'grass', '2,0': 'sand' });
  });

  it('+ a plant can sit on painted terrain and both survive a reload', async () => {
    const id = await createGarden('u1', 'Zen');
    const terrain = applyTerrainPaint({}, IDS.GRASS, 3, 3);
    const items = drop([], IDS.ROSE, 3, 3);

    await saveGardenLayout(id, items, terrain);
    const loaded = await reload(id);
    expect(loaded.items[0]).toMatchObject({ col: 3, row: 3 });
    expect(loaded.terrain).toEqual({ '3,3': 'grass' });
  });

  it('− a blocked drop never reaches Firestore', async () => {
    const id = await createGarden('u1', 'Zen');
    const items = drop([], IDS.OAK, 4, 4); // covers (4,4) and (4,5)
    await saveGardenLayout(id, items, {});

    const blocked = resolveCatalogDrop(entry(IDS.ROCK), items, 4, 5, NOW + 1);
    expect(blocked.type).toBe('blocked');
    // The screen only saves on 'place', so nothing new is written:
    expect((await reload(id)).items).toHaveLength(1);
  });

  it('+ moving an object persists its new position', async () => {
    const id = await createGarden('u1', 'Zen');
    const items = drop([], IDS.ROCK, 0, 0);
    items[0].moveTo(6, 9);
    await saveGardenLayout(id, items, {});
    expect((await reload(id)).items[0]).toMatchObject({ col: 6, row: 9 });
  });

  it('+ deleting an object persists its removal', async () => {
    const id = await createGarden('u1', 'Zen');
    let items = drop(drop([], IDS.ROCK, 0, 0, NOW), IDS.ROSE, 1, 0, NOW + 1);
    await saveGardenLayout(id, items, {});
    items = items.filter(i => i.instanceId !== String(NOW));
    await saveGardenLayout(id, items, {});
    expect((await reload(id)).items.map(i => i.entry.id)).toEqual([IDS.ROSE]);
  });

  it('− saving to a deleted garden fails with not-found instead of recreating it', async () => {
    const id = await createGarden('u1', 'Zen');
    await deleteGarden(id);
    await expect(saveGardenLayout(id, [], {})).rejects.toMatchObject({ code: 'not-found' });
    await expect(getGarden(id)).resolves.toBeNull();
  });
});

describe('growth across reloads', () => {
  it('+ a watered plant keeps growing while the app is closed', async () => {
    const id = await createGarden('u1', 'Zen');
    const items = drop([], IDS.ROSE, 0, 0);
    (items[0] as PlantObject).water(NOW);
    await saveGardenLayout(id, items, {});

    const later = await reload(id, NOW + 2 * MINUTE);
    expect((later.items[0] as PlantObject).isMature).toBe(true);
  });

  it('− an unwatered plant is exactly where it was left', async () => {
    const id = await createGarden('u1', 'Zen');
    await saveGardenLayout(id, drop([], IDS.OAK, 0, 0), {});
    const later = await reload(id, NOW + 1e9);
    expect((later.items[0] as PlantObject).growthStage).toBe(0);
  });
});

describe('ownership', () => {
  it('+ getUserGardens returns only that user\'s gardens', async () => {
    const mine1 = await createGarden('u1', 'Mine 1');
    await createGarden('u2', 'Theirs');
    const mine2 = await createGarden('u1', 'Mine 2');

    const mine = await getUserGardens('u1');
    expect(mine.map(g => g.id).sort()).toEqual([mine1, mine2].sort());
    expect(mine.every(g => g.OwnerId === 'u1')).toBe(true);
  });

  it('− a user with no gardens gets an empty list', async () => {
    await createGarden('u1', 'Mine');
    await expect(getUserGardens('nobody')).resolves.toEqual([]);
  });

  it('+ two gardens never share items', async () => {
    const a = await createGarden('u1', 'A');
    const b = await createGarden('u1', 'B');
    await saveGardenLayout(a, drop([], IDS.ROSE, 0, 0), {});
    await saveGardenLayout(b, drop([], IDS.ROCK, 5, 5), { '5,5': 'sand' });

    expect((await reload(a)).items.map(i => i.entry.id)).toEqual([IDS.ROSE]);
    expect((await reload(a)).terrain).toEqual({});
    expect((await reload(b)).items.map(i => i.entry.id)).toEqual([IDS.ROCK]);
  });
});
