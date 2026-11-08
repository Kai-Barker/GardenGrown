/**
 * Unit tests for services/garden.ts, with the Firestore SDK mocked.
 */
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, collection, id) => ({ path: `${collection}/${id}` })),
  collection: jest.fn((_db, name) => ({ collection: name })),
  query: jest.fn((ref, ...constraints) => ({ ref, constraints })),
  where: jest.fn((field, op, value) => ({ field, op, value })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
}));

import * as firestore from 'firebase/firestore';
import { createGarden, deleteGarden, getGarden, getUserGardens, saveGardenLayout } from '../../../services/garden';
import { IDS, NOW, makeDecoration, makeMaturePlant, makePlant } from '../../helpers/factories';

const fs = firestore as jest.Mocked<typeof firestore>;
const failure = (code: string) => Object.assign(new Error(code), { code });

/** Firestore rejects `undefined` at any depth — a mock won't, so check by hand. */
const findUndefined = (value: unknown, path = ''): string | null => {
  if (value === undefined) return path || '<root>';
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const found = findUndefined(v, path ? `${path}.${k}` : k);
      if (found) return found;
    }
  }
  return null;
};

beforeEach(() => jest.clearAllMocks());

describe('getUserGardens', () => {
  it('+ queries gardens by owner and returns each with its id', async () => {
    fs.getDocs.mockResolvedValue({
      docs: [
        { id: 'g1', data: () => ({ GardenTheme: 'Zen', OwnerId: 'u1' }) },
        { id: 'g2', data: () => ({ GardenTheme: 'Wild', OwnerId: 'u1' }) },
      ],
    } as any);

    await expect(getUserGardens('u1')).resolves.toEqual([
      { id: 'g1', GardenTheme: 'Zen', OwnerId: 'u1' },
      { id: 'g2', GardenTheme: 'Wild', OwnerId: 'u1' },
    ]);
    expect(fs.collection).toHaveBeenCalledWith(expect.anything(), 'gardens');
    expect(fs.where).toHaveBeenCalledWith('OwnerId', '==', 'u1');
  });

  it('+ returns an empty list for a user with no gardens', async () => {
    fs.getDocs.mockResolvedValue({ docs: [] } as any);
    await expect(getUserGardens('u1')).resolves.toEqual([]);
  });

  it('− propagates a query failure', async () => {
    fs.getDocs.mockRejectedValue(failure('unavailable'));
    await expect(getUserGardens('u1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('getGarden', () => {
  it('+ returns the garden document', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ GardenTheme: 'Zen' }) } as any);
    await expect(getGarden('g1')).resolves.toEqual({ GardenTheme: 'Zen' });
    expect(fs.doc).toHaveBeenCalledWith(expect.anything(), 'gardens', 'g1');
  });

  it('− returns null for a garden that no longer exists', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined } as any);
    await expect(getGarden('gone')).resolves.toBeNull();
  });

  it('− propagates a read failure', async () => {
    fs.getDoc.mockRejectedValue(failure('permission-denied'));
    await expect(getGarden('g1')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('createGarden', () => {
  it('+ creates an empty garden owned by the user and returns its id', async () => {
    fs.addDoc.mockResolvedValue({ id: 'new-garden' } as any);
    await expect(createGarden('u1', 'Zen')).resolves.toBe('new-garden');
    expect(fs.addDoc).toHaveBeenCalledWith({ collection: 'gardens' }, {
      OwnerId: 'u1',
      GardenTheme: 'Zen',
      TotalEntities: 0,
      PlacedItems: [],
      Terrain: {},
      CreatedAt: 'SERVER_TS',
    });
  });

  it('− propagates a write failure', async () => {
    fs.addDoc.mockRejectedValue(failure('resource-exhausted'));
    await expect(createGarden('u1', 'Zen')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

describe('saveGardenLayout', () => {
  const thirsty = makePlant('rose', 1, 1);
  const growing = makePlant('oak', 3, 3, IDS.OAK, { plantedAt: NOW, lastWateredAt: NOW, growthStage: 0, stageStartedAt: NOW });
  const mature = makeMaturePlant('tulip', 5, 5, '5');
  const rock = makeDecoration('rock', 7, 15);

  it('+ writes every object\'s data, the terrain, and the item count', async () => {
    await saveGardenLayout('g1', [thirsty, growing, mature, rock], { '0,0': 'grass' });
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'gardens/g1' }, {
      PlacedItems: [thirsty.toData(), growing.toData(), mature.toData(), rock.toData()],
      Terrain: { '0,0': 'grass' },
      TotalEntities: 4,
    });
  });

  it('+ saves an emptied garden', async () => {
    await saveGardenLayout('g1', [], {});
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'gardens/g1' }, { PlacedItems: [], Terrain: {}, TotalEntities: 0 });
  });

  it('− never sends undefined, which Firestore would reject', async () => {
    await saveGardenLayout('g1', [thirsty, growing, mature, rock], {});
    const payload = fs.updateDoc.mock.calls[0][1];
    expect(findUndefined(payload)).toBeNull();
  });

  it('− propagates a write failure (e.g. the garden was deleted)', async () => {
    fs.updateDoc.mockRejectedValue(failure('not-found'));
    await expect(saveGardenLayout('gone', [rock], {})).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('deleteGarden', () => {
  it('+ deletes the garden document', async () => {
    await deleteGarden('g1');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'gardens/g1' });
  });

  it('− propagates a delete failure', async () => {
    fs.deleteDoc.mockRejectedValue(failure('permission-denied'));
    await expect(deleteGarden('g1')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
