/**
 * Unit tests for the catalog, terrain registry and grid geometry helpers.
 */
import { CATALOG, getEntriesByKind, getEntry } from '../../../components/Garden/catalog';
import {
  COLUMNS,
  ROWS,
  TOTAL_CELLS,
  VISUAL_OVERSIZE,
  cellKey,
  computeVisualBox,
  parseCellKey,
} from '../../../components/Garden/constants';
import {
  TERRAIN,
  TERRAIN_ERASER_ID,
  TERRAIN_IDS,
  terrainCatalogId,
  terrainIdFromCatalogId,
} from '../../../components/Garden/terrain';
import { simpleGrowth, woodyGrowth } from '../../../components/Garden/growth';

describe('catalog', () => {
  it('+ every id is unique', () => {
    const ids = CATALOG.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('+ every entry has a known kind and a name', () => {
    for (const e of CATALOG) {
      expect(['plant', 'decoration', 'terrain']).toContain(e.kind);
      expect(e.name.length).toBeGreaterThan(0);
    }
  });

  it('+ every footprint fits on the grid', () => {
    for (const e of CATALOG) {
      expect(e.gridWidth ?? 1).toBeGreaterThanOrEqual(1);
      expect(e.gridHeight ?? 1).toBeGreaterThanOrEqual(1);
      expect(e.gridWidth ?? 1).toBeLessThanOrEqual(COLUMNS);
      expect(e.gridHeight ?? 1).toBeLessThanOrEqual(ROWS);
    }
  });

  it('+ every non-terrain entry has art', () => {
    for (const e of CATALOG.filter(e => e.kind !== 'terrain')) expect(e.image).toBeTruthy();
  });

  describe('plants', () => {
    const plants = getEntriesByKind('plant');

    it('+ every plant has growth stages ending in its own art', () => {
      for (const p of plants) {
        expect(p.growthStages?.length).toBeGreaterThanOrEqual(2);
        expect(p.growthStages![p.growthStages!.length - 1].image).toBe(p.image);
      }
    });

    it('+ every non-final stage takes a positive amount of time', () => {
      for (const p of plants) {
        for (const stage of p.growthStages!.slice(0, -1)) expect(stage.hoursToNextStage).toBeGreaterThan(0);
      }
    });
  });

  describe('lookup', () => {
    it('+ getEntry finds entries by id', () => {
      expect(getEntry('1')?.name).toBe('Rose');
      expect(getEntry('t_grass')?.kind).toBe('terrain');
    });

    it.each([undefined, '', 'nope', '8', ' 1'])('− getEntry(%p) is undefined', (id) => {
      expect(getEntry(id as any)).toBeUndefined();
    });

    it('+ getEntriesByKind partitions the whole catalog', () => {
      const total = (['plant', 'decoration', 'terrain'] as const)
        .reduce((n, kind) => n + getEntriesByKind(kind).length, 0);
      expect(total).toBe(CATALOG.length);
      expect(getEntriesByKind('decoration').every(e => e.kind === 'decoration')).toBe(true);
    });
  });
});

describe('terrain registry', () => {
  it('+ has a catalog entry for every terrain, plus the eraser', () => {
    const terrainEntries = getEntriesByKind('terrain').map(e => e.id).sort();
    expect(terrainEntries).toEqual([...TERRAIN_IDS.map(terrainCatalogId), TERRAIN_ERASER_ID].sort());
  });

  it('+ terrainCatalogId and terrainIdFromCatalogId are inverses', () => {
    for (const id of TERRAIN_IDS) expect(terrainIdFromCatalogId(terrainCatalogId(id))).toBe(id);
  });

  it('+ the eraser maps to null (clear the cell)', () => {
    expect(terrainIdFromCatalogId(TERRAIN_ERASER_ID)).toBeNull();
  });

  it('documents: terrainIdFromCatalogId trusts its input (applyTerrainPaint guards it)', () => {
    expect(terrainIdFromCatalogId('t_lava')).toBe('lava');
    expect('lava' in TERRAIN).toBe(false);
  });
});

describe('grid geometry', () => {
  it('+ the grid is 8 columns by 16 rows', () => {
    expect([COLUMNS, ROWS, TOTAL_CELLS]).toEqual([8, 16, 128]);
  });

  it('+ cellKey and parseCellKey round-trip every cell', () => {
    for (let c = 0; c < COLUMNS; c++) {
      for (let r = 0; r < ROWS; r++) expect(parseCellKey(cellKey(c, r))).toEqual({ col: c, row: r });
    }
  });

  it('+ cellKey uses the "col,row" format persisted in Terrain', () => {
    expect(cellKey(3, 12)).toBe('3,12');
  });

  describe('computeVisualBox', () => {
    it('+ a 1x1 renders oversized and centred on its cell', () => {
      expect(computeVisualBox({ gridWidth: 1, gridHeight: 1 })).toEqual({
        width: VISUAL_OVERSIZE, height: VISUAL_OVERSIZE, left: -(VISUAL_OVERSIZE - 1) / 2,
      });
    });

    it('+ a tall 1x1 is two cells high', () => {
      expect(computeVisualBox({ gridWidth: 1, gridHeight: 1, isTall: true }).height).toBe(2);
    });

    it('+ a large (1x2) item renders as a 2x2 oversized box', () => {
      const box = computeVisualBox({ gridWidth: 1, gridHeight: 2, isTall: true });
      expect(box).toEqual({ width: 2 * VISUAL_OVERSIZE, height: 2 * VISUAL_OVERSIZE, left: -(2 * VISUAL_OVERSIZE - 1) / 2 });
    });

    it('+ a fixed visualCells overrides the footprint', () => {
      expect(computeVisualBox({ gridWidth: 1, gridHeight: 2, visualCells: 0.75 })).toEqual({ width: 0.75, height: 0.75, left: 0.125 });
    });
  });
});

describe('growth presets', () => {
  it('+ simpleGrowth is seed -> mature', () => {
    expect(simpleGrowth('art').map(s => s.image).slice(-1)).toEqual(['art']);
    expect(simpleGrowth('art')).toHaveLength(2);
  });

  it('+ woodyGrowth is seed -> sapling -> mature', () => {
    expect(woodyGrowth('art')).toHaveLength(3);
  });
});
