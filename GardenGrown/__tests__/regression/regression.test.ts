/**
 * Regression suite: one test per bug this codebase has already had (most are
 * recorded in comments next to the code they bit). If one of these fails, an
 * old bug is back.
 */
jest.mock('firebase/firestore', () => require('../helpers/fakeFirebase').firestore);

import { CATALOG, getEntry } from '../../components/Garden/catalog';
import { COLUMNS, ROWS } from '../../components/Garden/constants';
import { PlantObject } from '../../components/Garden/objects';
import {
  buildOccupancy,
  createPlacedObject,
  findBlocker,
  isDropValid,
  parseGardenDoc,
  resolveCatalogDrop,
  resolveDropCell,
  screenToCell,
} from '../../components/Garden/placement';
import { createGarden, saveGardenLayout } from '../../services/garden';
import { resetFakeFirebase } from '../helpers/fakeFirebase';
import { IDS, MINUTE, NOW, entry, makePlant } from '../helpers/factories';

beforeEach(resetFakeFirebase);

describe('REGRESSION: zoomed placement silently refused every drop', () => {
  // measure() reports the grid's width at layout size even while zoomed, so
  // the bounds check compared a 3x-scaled touch against an unscaled width.
  it('a touch on the far side of a 3x-zoomed grid is still inside it', () => {
    const cell = 40;
    const rect = { pageX: -600, pageY: -1500, width: COLUMNS * cell, height: ROWS * cell };
    const x = rect.pageX + (COLUMNS - 0.5) * cell * 3;
    const y = rect.pageY + (ROWS - 0.5) * cell * 3;
    expect(screenToCell(x, y, rect, 3, cell)).toEqual({ col: COLUMNS - 1, row: ROWS - 1, inside: true });
  });
});

describe('REGRESSION: grid dimensions drifted between the garden and the dashboard', () => {
  // Copy-pasted constants went 4x8 vs 8x12, then 12 vs 16 rows. Gardens are
  // saved against this exact grid.
  it('the grid is 8 x 16', () => {
    expect([COLUMNS, ROWS]).toEqual([8, 16]);
  });
});

describe('REGRESSION: catalog ids are persisted and must never change', () => {
  // Renumbering ids silently mis-maps or drops items in existing gardens.
  const PINNED: Record<string, string> = {
    '1': 'Rose', '2': 'Mushroom', '3': 'Cactus', '4': 'Water Lily', '5': 'Red Tulip',
    '6': 'Blue Dandelion', '7': 'Lavender', '9': 'Pink Orchid', '10': 'Purple Vine',
    '11': 'Berry Bush', '12': 'Cherry Blossom', '13': 'Oak Tree', '14': 'Pink Hibiscus',
    '15': 'Rock', '16': 'Vertical Rock', '17': 'Stone Bench', '18': 'Wood Bench',
    '19': 'Stone Lantern', '20': 'Wood Lantern',
    '21': 'Daffodil', '22': 'Mistletoe', '23': 'Orange Pepper Flower', '24': 'Pink Pig Ears',
    '25': 'Pink Circle Flower', '26': 'Pink Flower and Grass', '27': 'Pink Flower on Leaves',
    '28': 'Pink Sphere Flower', '29': 'Red Alien Flower', '30': 'Red Flower',
    '31': 'Red Wavy Flower', '32': 'Red Sad Casing Flower', '33': 'Purple Screaming Flower',
    t_grass: 'Grass', t_water: 'Water', t_sand: 'Sand', t_none: 'Eraser',
  };

  it.each(Object.entries(PINNED))('id %p is still %p', (id, name) => {
    expect(getEntry(id)?.name).toBe(name);
  });

  it('no id has been added without being pinned here', () => {
    expect(CATALOG.map(e => e.id).sort()).toEqual(Object.keys(PINNED).sort());
  });

  it('the retired Brussel Sprout id "8" is never reused', () => {
    expect(getEntry('8')).toBeUndefined();
  });

  it('a garden containing a retired sprout still loads, minus the sprout', () => {
    const { items } = parseGardenDoc({
      PlacedItems: [
        { instanceId: 'a', catalogId: '8', col: 0, row: 0 },
        { instanceId: 'b', catalogId: '15', col: 1, row: 0 },
      ],
    }, NOW);
    expect(items.map(i => i.instanceId)).toEqual(['b']);
  });
});

describe('REGRESSION: grown gardens regressed to sprouts when growth shipped', () => {
  // Plants saved before growth existed have no growthStage; defaulting them to
  // 0 would have reset every existing garden to seeds.
  it('a pre-growth plant loads mature', () => {
    const { items } = parseGardenDoc({ PlacedItems: [{ instanceId: 'a', catalogId: IDS.OAK, col: 0, row: 0 }] }, NOW);
    expect((items[0] as PlantObject).isMature).toBe(true);
  });
});

describe('REGRESSION: Firestore rejected saves containing undefined', () => {
  // A thirsty plant has no stageStartedAt. Writing it as `undefined` made the
  // whole save fail — the strict fake Firestore rejects it the same way.
  it('saving a freshly planted (thirsty) seed succeeds', async () => {
    const id = await createGarden('u1', 'Zen');
    const seed = createPlacedObject(entry(IDS.ROSE), 0, 0, [], NOW)!;
    await expect(saveGardenLayout(id, [seed], {})).resolves.toBeUndefined();
  });

  it('a plant that has just advanced a stage (clock cleared) also saves', async () => {
    const id = await createGarden('u1', 'Zen');
    const oak = makePlant('oak', 0, 0, IDS.OAK);
    oak.water(NOW);
    oak.advanceGrowth(NOW + MINUTE);
    expect(oak.stageStartedAt).toBeUndefined();
    await expect(saveGardenLayout(id, [oak], {})).resolves.toBeUndefined();
  });
});

describe('REGRESSION: one watering cascaded a plant through several stages', () => {
  it('surplus time is discarded at each stage', () => {
    const oak = makePlant('oak', 0, 0, IDS.OAK);
    oak.water(NOW);
    for (let i = 0; i < 10; i++) oak.advanceGrowth(NOW + 1e9);
    expect(oak.growthStage).toBe(1);
  });
});

describe('REGRESSION: gardens created before terrain existed', () => {
  it('a document with no Terrain field loads with empty terrain', () => {
    expect(parseGardenDoc({ GardenTheme: 'Old', PlacedItems: [] }, NOW).terrain).toEqual({});
  });
});

describe('REGRESSION: a moved object collided with its own cells', () => {
  // Every move overlapping the object's current position read as blocked.
  it('nudging a 1x2 down one row is allowed', () => {
    const oak = makePlant('oak', 3, 3, IDS.OAK);
    expect(findBlocker(buildOccupancy([oak]), 3, 4, 1, 2, 'oak')).toBeNull();
    expect(isDropValid({ kind: 'catalog', entry: oak.entry }, [oak], 3, 4, 'oak')).toBe(true);
  });
});

describe('REGRESSION: the drop highlight and the actual drop disagreed', () => {
  // The highlight clamped to the grid while the drop path didn't (and vice
  // versa), so the exact right/bottom edge showed one cell and used another.
  it('at the exact bottom-right edge, highlight and drop target the same valid cell', () => {
    const ghost = { kind: 'catalog' as const, entry: entry(IDS.ROSE) };
    const cell = resolveDropCell({ col: COLUMNS, row: ROWS, inside: true }, ghost)!;
    expect(cell).toEqual({ col: COLUMNS - 1, row: ROWS - 1 });
    expect(isDropValid(ghost, [], cell.col, cell.row)).toBe(true);
    expect(resolveCatalogDrop(ghost.entry, [], cell.col, cell.row, NOW).type).toBe('place');
  });

  it('the watering can waters the plant the highlight was on, at the edge too', () => {
    const plant = makePlant('p', COLUMNS - 1, ROWS - 1);
    const cell = resolveDropCell({ col: COLUMNS, row: ROWS, inside: true }, { kind: 'can' })!;
    expect(isDropValid({ kind: 'can' }, [plant], cell.col, cell.row)).toBe(true);
  });
});

describe('REGRESSION: two drops in the same millisecond shared an instance id', () => {
  it('ids stay unique, so deleting one item never deletes its twin', () => {
    const a = createPlacedObject(entry(IDS.ROCK), 0, 0, [], NOW)!;
    const b = createPlacedObject(entry(IDS.ROCK), 1, 0, [a], NOW)!;
    expect(a.instanceId).not.toBe(b.instanceId);
  });
});
