/**
 * Unit tests for the placed-object model (components/Garden/objects.ts):
 * footprints, serialisation, and the plant growth state machine.
 */
import { DecorationObject, PlacedObject, PlantObject, TerrainTile } from '../../../components/Garden/objects';
import { SAPLING_IMAGE, SEED_IMAGE } from '../../../components/Garden/growth';
import { IDS, MINUTE, NOW, entry, fakeEntry, makeDecoration, makeMaturePlant, makePlant, makeTerrainTile } from '../../helpers/factories';

const containsUndefined = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'object' && value !== null && Object.values(value).some(containsUndefined));

describe('PlacedObject (shared behaviour)', () => {
  it('+ a 1x1 occupies exactly its own cell', () => {
    expect(makeDecoration('r', 3, 4).occupiedCells()).toEqual(['3,4']);
  });

  it('+ a 1x2 occupies its cell and the one below', () => {
    expect(makePlant('o', 2, 5, IDS.OAK).occupiedCells()).toEqual(['2,5', '2,6']);
  });

  it('+ a 2x2 occupies all four cells', () => {
    const big = new DecorationObject('b', fakeEntry({ id: 'big', kind: 'decoration', gridWidth: 2, gridHeight: 2 }), 0, 0);
    expect(big.occupiedCells().sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('+ footprint defaults to 1x1 when the entry omits it', () => {
    const rose = makePlant('r', 0, 0);
    expect([rose.gridWidth, rose.gridHeight, rose.isTall]).toEqual([1, 1, false]);
  });

  it('+ reads isTall from the entry', () => {
    expect(makeDecoration('l', 0, 0, IDS.LANTERN).isTall).toBe(true);
  });

  it('+ moveTo updates the position, returns itself, and moves the footprint', () => {
    const oak = makePlant('o', 0, 0, IDS.OAK);
    expect(oak.moveTo(5, 9)).toBe(oak);
    expect(oak.occupiedCells()).toEqual(['5,9', '5,10']);
  });

  it('+ blocks placement, paints on layer 1, and is draggable', () => {
    const rock = makeDecoration('r', 0, 0);
    expect([rock.blocksPlacement, rock.layer, rock.isDraggable]).toEqual([true, 1, true]);
  });

  it('+ shows the catalog image', () => {
    expect(makeDecoration('r', 0, 0).getImage()).toBe(entry(IDS.ROCK).image);
  });

  it('+ a decoration serialises to just its identity and position', () => {
    expect(makeDecoration('r', 6, 7).toData()).toEqual({ instanceId: 'r', catalogId: IDS.ROCK, col: 6, row: 7 });
  });
});

describe('TerrainTile', () => {
  it('+ never blocks, paints beneath everything, and cannot be dragged', () => {
    const tile = makeTerrainTile('t', 1, 1);
    expect([tile.kind, tile.blocksPlacement, tile.layer, tile.isDraggable]).toEqual(['terrain', false, 0, false]);
  });
});

describe('PlacedObject.fromData', () => {
  it('+ rebuilds each kind as its own class', () => {
    expect(PlacedObject.fromData({ instanceId: 'a', catalogId: IDS.ROSE, col: 0, row: 0 }, entry(IDS.ROSE))).toBeInstanceOf(PlantObject);
    expect(PlacedObject.fromData({ instanceId: 'b', catalogId: IDS.ROCK, col: 0, row: 0 }, entry(IDS.ROCK))).toBeInstanceOf(DecorationObject);
    expect(PlacedObject.fromData({ instanceId: 'c', catalogId: IDS.GRASS, col: 0, row: 0 }, entry(IDS.GRASS))).toBeInstanceOf(TerrainTile);
  });

  it('− returns null when the catalog entry is missing', () => {
    expect(PlacedObject.fromData({ instanceId: 'x', catalogId: 'gone', col: 0, row: 0 }, undefined)).toBeNull();
  });

  it('− returns null for an entry of an unknown kind', () => {
    const weird = fakeEntry({ id: 'w', kind: 'mystery' as any });
    expect(PlacedObject.fromData({ instanceId: 'x', catalogId: 'w', col: 0, row: 0 }, weird)).toBeNull();
  });

  it('+ round-trips a growing plant exactly', () => {
    const data = { instanceId: 'p', catalogId: IDS.OAK, col: 3, row: 4, plantedAt: NOW, lastWateredAt: NOW + 1, growthStage: 1, stageStartedAt: NOW + 2 };
    expect(PlacedObject.fromData(data, entry(IDS.OAK))!.toData()).toEqual(data);
  });
});

describe('PlantObject', () => {
  describe('construction', () => {
    it('+ defaults plantedAt/lastWateredAt to now', () => {
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
      try {
        const p = new PlantObject('p', entry(IDS.ROSE), 0, 0, { growthStage: 0 });
        expect([p.plantedAt, p.lastWateredAt]).toEqual([NOW, NOW]);
      } finally {
        spy.mockRestore();
      }
    });

    it('+ a plant saved before growth existed (no growthStage) loads mature', () => {
      const legacy = new PlantObject('p', entry(IDS.OAK), 0, 0);
      expect(legacy.growthStage).toBe(2);
      expect(legacy.isMature).toBe(true);
    });

    it('+ a plant with no growth stages at all is mature at stage 0', () => {
      const instant = new PlantObject('p', fakeEntry({ id: 'i', kind: 'plant' }), 0, 0);
      expect(instant.growthStage).toBe(0);
      expect(instant.isMature).toBe(true);
      expect(instant.getVisualCells()).toBeUndefined();
    });
  });

  describe('thirst and watering', () => {
    it('+ a new seed is thirsty', () => {
      expect(makePlant('p', 0, 0).isThirsty).toBe(true);
    });

    it('+ watering a thirsty plant starts its clock and reports success', () => {
      const p = makePlant('p', 0, 0);
      expect(p.water(NOW + 5)).toBe(true);
      expect(p.stageStartedAt).toBe(NOW + 5);
      expect(p.lastWateredAt).toBe(NOW + 5);
      expect(p.isThirsty).toBe(false);
    });

    it('− watering twice in one stage is refused and does not restart the clock', () => {
      const p = makePlant('p', 0, 0);
      p.water(NOW);
      expect(p.water(NOW + MINUTE / 2)).toBe(false);
      expect(p.stageStartedAt).toBe(NOW);
    });

    it('− watering a mature plant is refused, and a mature plant is never thirsty', () => {
      const p = makeMaturePlant('p', 0, 0);
      expect(p.isThirsty).toBe(false);
      expect(p.water(NOW)).toBe(false);
      expect(p.stageStartedAt).toBeUndefined();
    });

    it('+ water() defaults to the current time', () => {
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW + 42);
      try {
        const p = makePlant('p', 0, 0);
        p.water();
        expect(p.stageStartedAt).toBe(NOW + 42);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('growth', () => {
    it('− does not grow while thirsty, however much time passes', () => {
      const p = makePlant('p', 0, 0);
      p.advanceGrowth(NOW + 1e9);
      expect(p.growthStage).toBe(0);
    });

    it('− does not grow before the stage duration has elapsed', () => {
      const p = makePlant('p', 0, 0);
      p.water(NOW);
      p.advanceGrowth(NOW + MINUTE - 1);
      expect(p.growthStage).toBe(0);
      expect(p.stageStartedAt).toBe(NOW);
    });

    it('+ grows exactly when the duration elapses, then needs water again', () => {
      const p = makePlant('p', 0, 0, IDS.CACTUS);
      p.water(NOW);
      expect(p.advanceGrowth(NOW + MINUTE)).toBe(p);
      expect(p.growthStage).toBe(1);
      expect(p.stageStartedAt).toBeUndefined();
      expect(p.isThirsty).toBe(true);
    });

    it('− surplus time never cascades through several stages', () => {
      const p = makePlant('p', 0, 0, IDS.OAK);
      p.water(NOW);
      p.advanceGrowth(NOW + 365 * 24 * 60 * MINUTE);
      p.advanceGrowth(NOW + 365 * 24 * 60 * MINUTE); // a second tick changes nothing either
      expect(p.growthStage).toBe(1);
    });

    it('+ a simple plant reaches maturity after one watering', () => {
      const p = makePlant('p', 0, 0, IDS.ROSE);
      p.water(NOW);
      p.advanceGrowth(NOW + MINUTE);
      expect(p.isMature).toBe(true);
    });

    it('+ a woody plant needs two waterings: seed -> sapling -> mature', () => {
      const p = makePlant('p', 0, 0, IDS.OAK);
      p.water(NOW);
      p.advanceGrowth(NOW + MINUTE);
      expect([p.growthStage, p.isMature]).toEqual([1, false]);

      p.water(NOW + 2 * MINUTE);
      p.advanceGrowth(NOW + 3 * MINUTE);
      expect([p.growthStage, p.isMature]).toEqual([2, true]);
    });

    it('− a mature plant stays mature', () => {
      const p = makeMaturePlant('p', 0, 0, IDS.OAK);
      p.stageStartedAt = NOW; // even with a stray clock
      p.advanceGrowth(NOW + 1e9);
      expect(p.growthStage).toBe(2);
    });

    it('+ advanceGrowth defaults to the current time', () => {
      const p = makePlant('p', 0, 0);
      p.water(NOW);
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW + MINUTE);
      try {
        p.advanceGrowth();
        expect(p.isMature).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('appearance', () => {
    it('+ shows seed, sapling and mature art at each stage', () => {
      const p = makePlant('p', 0, 0, IDS.OAK);
      expect(p.getImage()).toBe(SEED_IMAGE);
      p.growthStage = 1;
      expect(p.getImage()).toBe(SAPLING_IMAGE);
      p.growthStage = 2;
      expect(p.getImage()).toBe(entry(IDS.OAK).image);
    });

    it('+ early stages render at a fixed size; the final stage uses the plant\'s own', () => {
      const p = makePlant('p', 0, 0, IDS.OAK);
      expect(p.getVisualCells()).toBe(0.75);
      p.growthStage = 1;
      expect(p.getVisualCells()).toBe(1.25);
      p.growthStage = 2;
      expect(p.getVisualCells()).toBeUndefined();
    });

    it('− an out-of-range stage is clamped to the last one rather than crashing', () => {
      const p = makePlant('p', 0, 0, IDS.ROSE);
      p.growthStage = 99;
      expect(p.getImage()).toBe(entry(IDS.ROSE).image);
    });

    it('+ a plant with no stages shows its own image', () => {
      const instant = new PlantObject('p', fakeEntry({ id: 'i', kind: 'plant', image: 'art' }), 0, 0);
      expect(instant.getImage()).toBe('art');
    });
  });

  describe('serialisation', () => {
    it('+ writes every growth field for a growing plant', () => {
      const p = makePlant('p', 1, 2);
      p.water(NOW + 1);
      expect(p.toData()).toEqual({
        instanceId: 'p', catalogId: IDS.ROSE, col: 1, row: 2,
        plantedAt: NOW, lastWateredAt: NOW + 1, growthStage: 0, stageStartedAt: NOW + 1,
      });
    });

    it('− omits stageStartedAt for a thirsty plant instead of writing undefined', () => {
      const data = makePlant('p', 1, 2).toData();
      expect('stageStartedAt' in data).toBe(false);
      expect(containsUndefined(data)).toBe(false);
    });
  });
});
