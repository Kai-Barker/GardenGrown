/**
 * Unit tests for the garden's placement rules (components/Garden/placement.ts).
 *
 * This is the most heavily tested part of the app: every drop, move, watering
 * and terrain paint goes through these functions. Each block covers the happy
 * path (+) and the inputs that must be refused or corrected (−).
 */
import { CELL_SIZE, COLUMNS, ROWS, TOTAL_CELLS } from '../../../components/Garden/constants';
import { DecorationObject, PlacedObject, PlantObject } from '../../../components/Garden/objects';
import {
  applyTerrainPaint,
  buildOccupancy,
  clampToGrid,
  createPlacedObject,
  findBlocker,
  findObjectAtCell,
  isDropValid,
  parseGardenDoc,
  resolveCatalogDrop,
  resolveDropCell,
  screenToCell,
  snapFromTranslation,
  type Ghost,
} from '../../../components/Garden/placement';
import type { TerrainMap } from '../../../components/Garden/types';
import {
  IDS,
  MINUTE,
  NOW,
  entry,
  fakeEntry,
  makeDecoration,
  makeMaturePlant,
  makePlant,
  makeTerrainTile,
} from '../../helpers/factories';

/** Every (col, row) on the grid. */
const ALL_CELLS: [number, number][] = [];
for (let c = 0; c < COLUMNS; c++) for (let r = 0; r < ROWS; r++) ALL_CELLS.push([c, r]);

const catalogGhost = (id: string): Ghost => ({ kind: 'catalog', entry: entry(id) });
const CAN: Ghost = { kind: 'can' };

/* SCREEN -> GRID
=================================================== */
describe('screenToCell', () => {
  // Round numbers keep the expectations readable; the real CELL_SIZE is
  // covered separately below.
  const CS = 40;
  const rect = { pageX: 20, pageY: 100, width: COLUMNS * CS, height: ROWS * CS };
  const centreOf = (col: number, row: number, zoom = 1, r = rect) => ({
    x: r.pageX + (col + 0.5) * CS * zoom,
    y: r.pageY + (row + 0.5) * CS * zoom,
  });

  it.each(ALL_CELLS)('+ maps the centre of cell (%i, %i) to that cell', (col, row) => {
    const { x, y } = centreOf(col, row);
    expect(screenToCell(x, y, rect, 1, CS)).toEqual({ col, row, inside: true });
  });

  it('+ maps the exact top-left corner to (0, 0)', () => {
    expect(screenToCell(rect.pageX, rect.pageY, rect, 1, CS)).toEqual({ col: 0, row: 0, inside: true });
  });

  it('+ treats the exact bottom-right corner as inside, one past the last cell (callers clamp)', () => {
    const hit = screenToCell(rect.pageX + rect.width, rect.pageY + rect.height, rect, 1, CS);
    expect(hit).toEqual({ col: COLUMNS, row: ROWS, inside: true });
  });

  it('+ floors at cell boundaries: a boundary pixel belongs to the next cell', () => {
    expect(screenToCell(rect.pageX + CS - 0.01, rect.pageY, rect, 1, CS).col).toBe(0);
    expect(screenToCell(rect.pageX + CS, rect.pageY, rect, 1, CS).col).toBe(1);
    expect(screenToCell(rect.pageX, rect.pageY + CS - 0.01, rect, 1, CS).row).toBe(0);
    expect(screenToCell(rect.pageX, rect.pageY + CS, rect, 1, CS).row).toBe(1);
  });

  it.each([
    ['left', rect.pageX - 1, rect.pageY + 10],
    ['top', rect.pageX + 10, rect.pageY - 1],
    ['right', rect.pageX + rect.width + 1, rect.pageY + 10],
    ['bottom', rect.pageX + 10, rect.pageY + rect.height + 1],
    ['far away', -5000, 9000],
  ])('− reports a touch 1px past the %s edge as outside', (_edge, x, y) => {
    expect(screenToCell(x, y, rect, 1, CS).inside).toBe(false);
  });

  describe('while zoomed', () => {
    // At zoom the grid's page origin scrolls off-screen (negative), and
    // measure() reports width/height at layout size, not on-screen size.
    const zoomedRect = { ...rect, pageX: -350, pageY: -900 };

    it.each([2, 3])('+ maps cell centres correctly at %ix zoom', (zoom) => {
      for (const [col, row] of [[0, 0], [3, 7], [COLUMNS - 1, ROWS - 1]]) {
        const { x, y } = centreOf(col, row, zoom, zoomedRect);
        expect(screenToCell(x, y, zoomedRect, zoom, CS)).toEqual({ col, row, inside: true });
      }
    });

    it('+ accepts touches beyond the unzoomed width (the on-screen grid is bigger)', () => {
      const x = zoomedRect.pageX + rect.width * 1.5; // past layout width, within 2x width
      expect(screenToCell(x, zoomedRect.pageY + 10, zoomedRect, 2, CS).inside).toBe(true);
    });

    it('+ handles zooming out (0.5x): cells are half size', () => {
      const hit = screenToCell(rect.pageX + CS * 0.5 * 3 + 1, rect.pageY + 1, rect, 0.5, CS);
      expect(hit).toEqual({ col: 3, row: 0, inside: true });
    });
  });

  it.each([0, -1, -3, NaN])('− falls back to zoom 1 for an invalid zoom of %p', (zoom) => {
    const { x, y } = centreOf(5, 9);
    expect(screenToCell(x, y, rect, zoom, CS)).toEqual({ col: 5, row: 9, inside: true });
  });

  it('+ defaults to the real CELL_SIZE when no cell size is given', () => {
    const realRect = { pageX: 0, pageY: 0, width: COLUMNS * CELL_SIZE, height: ROWS * CELL_SIZE };
    expect(screenToCell(CELL_SIZE * 2.5, CELL_SIZE * 4.5, realRect, 1)).toEqual({ col: 2, row: 4, inside: true });
  });
});

/* CLAMPING
=================================================== */
describe('clampToGrid', () => {
  it.each(ALL_CELLS)('+ leaves an in-bounds 1x1 at (%i, %i) unchanged', (col, row) => {
    expect(clampToGrid(col, row, 1, 1)).toEqual({ col, row });
  });

  it.each([
    [-1, -1, 0, 0],
    [-100, 5, 0, 5],
    [3, -7, 3, 0],
    [COLUMNS, ROWS, COLUMNS - 1, ROWS - 1],
    [999, 999, COLUMNS - 1, ROWS - 1],
  ])('− clamps an off-grid 1x1 at (%i, %i) to (%i, %i)', (col, row, eCol, eRow) => {
    expect(clampToGrid(col, row, 1, 1)).toEqual({ col: eCol, row: eRow });
  });

  it('+ pulls a 1x2 item on the last row up so its whole footprint fits', () => {
    expect(clampToGrid(2, ROWS - 1, 1, 2)).toEqual({ col: 2, row: ROWS - 2 });
  });

  it('+ leaves a 1x2 item that already fits flush with the bottom alone', () => {
    expect(clampToGrid(2, ROWS - 2, 1, 2)).toEqual({ col: 2, row: ROWS - 2 });
  });

  it('+ clamps both axes for a 2x2 footprint in the bottom-right corner', () => {
    expect(clampToGrid(COLUMNS - 1, ROWS - 1, 2, 2)).toEqual({ col: COLUMNS - 2, row: ROWS - 2 });
  });

  it('+ pins a footprint the size of the whole grid to (0, 0)', () => {
    expect(clampToGrid(4, 9, COLUMNS, ROWS)).toEqual({ col: 0, row: 0 });
  });
});

describe('snapFromTranslation', () => {
  const CS = 50;

  it('+ snaps exact multiples of the cell size to that cell', () => {
    expect(snapFromTranslation(3 * CS, 6 * CS, CS, 1, 1)).toEqual({ col: 3, row: 6 });
  });

  it('+ rounds to the nearest cell (half rounds up)', () => {
    expect(snapFromTranslation(0.49 * CS, 0.49 * CS, CS, 1, 1)).toEqual({ col: 0, row: 0 });
    expect(snapFromTranslation(0.5 * CS, 0.5 * CS, CS, 1, 1)).toEqual({ col: 1, row: 1 });
    expect(snapFromTranslation(2.51 * CS, 4.49 * CS, CS, 1, 1)).toEqual({ col: 3, row: 4 });
  });

  it('− clamps a drag past the top-left to (0, 0)', () => {
    expect(snapFromTranslation(-0.4 * CS, -10 * CS, CS, 1, 1)).toEqual({ col: 0, row: 0 });
  });

  it('− clamps a drag past the bottom-right so the footprint stays on the grid', () => {
    expect(snapFromTranslation(100 * CS, 100 * CS, CS, 1, 1)).toEqual({ col: COLUMNS - 1, row: ROWS - 1 });
    expect(snapFromTranslation(100 * CS, 100 * CS, CS, 1, 2)).toEqual({ col: COLUMNS - 1, row: ROWS - 2 });
  });
});

/* OCCUPANCY & COLLISION
=================================================== */
describe('buildOccupancy', () => {
  it('+ is empty for an empty garden', () => {
    expect(buildOccupancy([])).toEqual({});
  });

  it('+ maps a 1x1 item to its single cell', () => {
    expect(buildOccupancy([makePlant('rose', 2, 3)])).toEqual({ '2,3': 'rose' });
  });

  it('+ maps a 1x2 item to both of its cells', () => {
    expect(buildOccupancy([makePlant('oak', 4, 5, IDS.OAK)])).toEqual({ '4,5': 'oak', '4,6': 'oak' });
  });

  it('− skips terrain, which never blocks placement', () => {
    expect(buildOccupancy([makeTerrainTile('grass', 1, 1)])).toEqual({});
  });

  it('+ combines several items', () => {
    const map = buildOccupancy([
      makePlant('rose', 0, 0),
      makePlant('oak', 3, 3, IDS.OAK),
      makeDecoration('rock', 7, 15),
      makeTerrainTile('grass', 5, 5),
    ]);
    expect(map).toEqual({ '0,0': 'rose', '3,3': 'oak', '3,4': 'oak', '7,15': 'rock' });
  });

  it('documents: if corrupt data overlaps two items, the later one wins the cell', () => {
    expect(buildOccupancy([makePlant('a', 1, 1), makeDecoration('b', 1, 1)])).toEqual({ '1,1': 'b' });
  });
});

describe('findBlocker', () => {
  const rose = makePlant('rose', 3, 5);
  const oak = makePlant('oak', 5, 5, IDS.OAK); // covers (5,5) and (5,6)
  const occupied = buildOccupancy([rose, oak]);

  it.each(ALL_CELLS)('+ finds nothing at (%i, %i) on an empty grid', (col, row) => {
    expect(findBlocker({}, col, row, 1, 1)).toBeNull();
  });

  it('− reports the item occupying the exact cell', () => {
    expect(findBlocker(occupied, 3, 5, 1, 1)).toBe('rose');
  });

  it('− reports a blocker under either cell of a 1x2 footprint', () => {
    expect(findBlocker(occupied, 3, 4, 1, 2)).toBe('rose'); // bottom cell hits
    expect(findBlocker(occupied, 3, 5, 1, 2)).toBe('rose'); // top cell hits
  });

  it('− blocks any cell of a multi-cell item, not just its origin', () => {
    expect(findBlocker(occupied, 5, 6, 1, 1)).toBe('oak');
  });

  it.each([
    ['left', 2, 5],
    ['right', 4, 5],
    ['above', 3, 4],
    ['below', 3, 6],
  ])('+ allows the cell directly %s an item', (_side, col, row) => {
    expect(findBlocker(occupied, col, row, 1, 1)).toBeNull();
  });

  it('+ allows a 1x2 footprint ending directly above an item', () => {
    expect(findBlocker(occupied, 3, 3, 1, 2)).toBeNull();
  });

  it('+ lets a moving item overlap its own cells (ignoreId)', () => {
    expect(findBlocker(occupied, 5, 5, 1, 2, 'oak')).toBeNull();
    // Shifting the oak down one row overlaps its own lower cell only.
    expect(findBlocker(occupied, 5, 6, 1, 2, 'oak')).toBeNull();
  });

  it('− still blocks a moving item that overlaps itself AND another item', () => {
    const tight = buildOccupancy([makePlant('oak', 5, 5, IDS.OAK), makePlant('rose', 5, 7)]);
    expect(findBlocker(tight, 5, 6, 1, 2, 'oak')).toBe('rose');
  });

  it('− an ignoreId that matches nothing changes nothing', () => {
    expect(findBlocker(occupied, 3, 5, 1, 1, 'ghost')).toBe('rose');
  });

  it('− checks every cell of a wide footprint', () => {
    expect(findBlocker(occupied, 2, 5, 2, 2)).toBe('rose'); // covers (2..3, 5..6)
    expect(findBlocker(occupied, 0, 0, 2, 2)).toBeNull();
  });
});

describe('findObjectAtCell', () => {
  const oak = makePlant('oak', 2, 2, IDS.OAK);
  const rock = makeDecoration('rock', 6, 6);
  const grass = makeTerrainTile('grass', 0, 0);
  const items = [oak, rock, grass];

  it('+ finds a multi-cell item from any of its cells', () => {
    expect(findObjectAtCell(items, 2, 2)).toBe(oak);
    expect(findObjectAtCell(items, 2, 3)).toBe(oak);
  });

  it('+ finds decorations too', () => {
    expect(findObjectAtCell(items, 6, 6)).toBe(rock);
  });

  it('− returns null for an empty cell', () => {
    expect(findObjectAtCell(items, 7, 15)).toBeNull();
  });

  it('− ignores terrain', () => {
    expect(findObjectAtCell(items, 0, 0)).toBeNull();
  });
});

/* DROP RESOLUTION
=================================================== */
describe('resolveDropCell', () => {
  const inside = (col: number, row: number) => ({ col, row, inside: true });

  it('− returns null for a touch off the grid', () => {
    expect(resolveDropCell({ col: 2, row: 2, inside: false }, catalogGhost(IDS.ROSE))).toBeNull();
  });

  it('+ passes through an in-bounds cell for a 1x1', () => {
    expect(resolveDropCell(inside(4, 4), catalogGhost(IDS.ROSE))).toEqual({ col: 4, row: 4 });
  });

  it('+ clamps the one-past-the-end hit from the exact bottom-right edge', () => {
    expect(resolveDropCell(inside(COLUMNS, ROWS), catalogGhost(IDS.ROSE))).toEqual({ col: COLUMNS - 1, row: ROWS - 1 });
  });

  it('+ pulls a 1x2 ghost up off the last row', () => {
    expect(resolveDropCell(inside(1, ROWS - 1), catalogGhost(IDS.OAK))).toEqual({ col: 1, row: ROWS - 2 });
  });

  it('+ treats the watering can as 1x1', () => {
    expect(resolveDropCell(inside(COLUMNS, ROWS), CAN)).toEqual({ col: COLUMNS - 1, row: ROWS - 1 });
  });

  it('+ treats terrain as 1x1 even if its entry claimed a bigger footprint', () => {
    const bigTerrain: Ghost = { kind: 'catalog', entry: fakeEntry({ id: 't_big', kind: 'terrain', gridWidth: 2, gridHeight: 2 }) };
    expect(resolveDropCell(inside(COLUMNS - 1, ROWS - 1), bigTerrain)).toEqual({ col: COLUMNS - 1, row: ROWS - 1 });
  });
});

describe('isDropValid', () => {
  const thirsty = makePlant('thirsty', 0, 0, IDS.OAK); // (0,0)-(0,1), stage 0, unwatered
  const watered = makePlant('watered', 2, 0, IDS.ROSE, { plantedAt: NOW, lastWateredAt: NOW, growthStage: 0, stageStartedAt: NOW });
  const mature = makeMaturePlant('mature', 4, 0);
  const rock = makeDecoration('rock', 6, 0);
  const grass = makeTerrainTile('grass', 7, 7);
  const items: PlacedObject[] = [thirsty, watered, mature, rock, grass];

  describe('catalog items', () => {
    it('+ valid on an empty cell', () => {
      expect(isDropValid(catalogGhost(IDS.ROSE), items, 3, 3)).toBe(true);
    });

    it('+ valid on a terrain-painted cell (terrain never blocks)', () => {
      expect(isDropValid(catalogGhost(IDS.ROSE), items, 7, 7)).toBe(true);
    });

    it('− invalid on an occupied cell', () => {
      expect(isDropValid(catalogGhost(IDS.ROSE), items, 6, 0)).toBe(false);
    });

    it('− invalid when either cell of a 1x2 is occupied', () => {
      const blocker = [makePlant('r', 3, 6)];
      expect(isDropValid(catalogGhost(IDS.OAK), blocker, 3, 5)).toBe(false); // bottom cell hits
      expect(isDropValid(catalogGhost(IDS.OAK), blocker, 3, 6)).toBe(false); // top cell hits
      expect(isDropValid(catalogGhost(IDS.OAK), blocker, 3, 4)).toBe(true); // ends just above it
    });

    it('+ a moving item may land on its own cells', () => {
      expect(isDropValid(catalogGhost(IDS.OAK), items, 0, 0, 'thirsty')).toBe(true);
      expect(isDropValid(catalogGhost(IDS.OAK), items, 0, 1, 'thirsty')).toBe(true);
    });

    it('− a moving item still may not land on someone else', () => {
      expect(isDropValid(catalogGhost(IDS.OAK), items, 2, 0, 'thirsty')).toBe(false);
    });
  });

  describe('terrain', () => {
    it.each([IDS.GRASS, IDS.WATER, IDS.SAND, IDS.ERASER])('+ %s is valid even on an occupied cell', (id) => {
      expect(isDropValid(catalogGhost(id), items, 6, 0)).toBe(true);
      expect(isDropValid(catalogGhost(id), items, 3, 3)).toBe(true);
    });
  });

  describe('watering can', () => {
    it('+ valid over a thirsty plant — from any cell of its footprint', () => {
      expect(isDropValid(CAN, items, 0, 0)).toBe(true);
      expect(isDropValid(CAN, items, 0, 1)).toBe(true);
    });

    it('− invalid over a plant that is already growing', () => {
      expect(isDropValid(CAN, items, 2, 0)).toBe(false);
    });

    it('− invalid over a mature plant', () => {
      expect(isDropValid(CAN, items, 4, 0)).toBe(false);
    });

    it('− invalid over a decoration', () => {
      expect(isDropValid(CAN, items, 6, 0)).toBe(false);
    });

    it('− invalid over an empty or terrain-only cell', () => {
      expect(isDropValid(CAN, items, 3, 3)).toBe(false);
      expect(isDropValid(CAN, items, 7, 7)).toBe(false);
    });
  });
});

describe('createPlacedObject', () => {
  it('+ creates a plant at its first stage, thirsty and not growing', () => {
    const plant = createPlacedObject(entry(IDS.ROSE), 2, 3, [], NOW);
    expect(plant).toBeInstanceOf(PlantObject);
    const p = plant as PlantObject;
    expect(p).toMatchObject({ col: 2, row: 3, instanceId: String(NOW), growthStage: 0, plantedAt: NOW, lastWateredAt: NOW });
    expect(p.stageStartedAt).toBeUndefined();
    expect(p.isThirsty).toBe(true);
    expect(p.isMature).toBe(false);
  });

  it('+ creates a decoration with no growth state', () => {
    const rock = createPlacedObject(entry(IDS.ROCK), 7, 15, [], NOW);
    expect(rock).toBeInstanceOf(DecorationObject);
    expect(rock!.toData()).toEqual({ instanceId: String(NOW), catalogId: IDS.ROCK, col: 7, row: 15 });
  });

  it('− refuses terrain, which is painted rather than placed', () => {
    expect(createPlacedObject(entry(IDS.GRASS), 0, 0, [], NOW)).toBeNull();
  });

  it('− never reuses an id when two drops land in the same millisecond', () => {
    const first = createPlacedObject(entry(IDS.ROSE), 0, 0, [], NOW)!;
    const second = createPlacedObject(entry(IDS.ROSE), 1, 0, [first], NOW)!;
    const third = createPlacedObject(entry(IDS.ROSE), 2, 0, [first, second], NOW)!;
    expect(first.instanceId).toBe(String(NOW));
    expect(second.instanceId).toBe(`${NOW}-1`);
    expect(third.instanceId).toBe(`${NOW}-2`);
  });

  it('+ uses the current time when none is passed', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW + 5);
    try {
      expect(createPlacedObject(entry(IDS.ROCK), 0, 0, [])!.instanceId).toBe(String(NOW + 5));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('resolveCatalogDrop', () => {
  const rose = makePlant('rose', 3, 3);
  const items = [rose];

  it('+ places a new object on a free cell without mutating the input list', () => {
    const result = resolveCatalogDrop(entry(IDS.ROCK), items, 4, 4, NOW);
    expect(result.type).toBe('place');
    if (result.type !== 'place') return;
    expect(result.item).toMatchObject({ col: 4, row: 4, instanceId: String(NOW) });
    expect(items).toHaveLength(1);
  });

  it('− refuses a drop onto an occupied cell, naming the blocker', () => {
    expect(resolveCatalogDrop(entry(IDS.ROCK), items, 3, 3, NOW)).toEqual({ type: 'blocked', blockerId: 'rose' });
  });

  it('− refuses a 1x2 whose lower cell would overlap', () => {
    expect(resolveCatalogDrop(entry(IDS.OAK), items, 3, 2, NOW)).toEqual({ type: 'blocked', blockerId: 'rose' });
  });

  it('+ paints terrain, even under an existing object', () => {
    expect(resolveCatalogDrop(entry(IDS.GRASS), items, 3, 3, NOW))
      .toEqual({ type: 'paint', catalogId: IDS.GRASS, col: 3, row: 3 });
  });

  it('− refuses an entry of an unknown kind instead of crashing', () => {
    const mystery = fakeEntry({ id: 'x', kind: 'mystery' as any });
    expect(resolveCatalogDrop(mystery, [], 0, 0, NOW)).toEqual({ type: 'blocked', blockerId: '' });
  });
});

/* HIGHLIGHT == OUTCOME
=================================================== */
/**
 * The drop highlight (isDropValid) and the code that actually performs the
 * drop are separate calls. If they ever disagree the player sees green and
 * gets a buzz, or red and gets a placement. Sweep every cell to prove they
 * can't.
 */
describe('consistency: the highlight always matches the real outcome', () => {
  const layout = () => [
    makePlant('rose', 1, 1),
    makePlant('oak', 3, 2, IDS.OAK),
    makeDecoration('rock', 5, 5),
    makePlant('cactus', 0, 10, IDS.CACTUS),
    makeMaturePlant('mature', 6, 14),
    makePlant('growing', 7, 0, IDS.ROSE, { plantedAt: NOW, lastWateredAt: NOW, growthStage: 0, stageStartedAt: NOW }),
    makeTerrainTile('grass', 2, 2),
  ];

  // Includes ROWS/COLUMNS so the one-past-the-end edge hit is swept too.
  const hits: [number, number][] = [];
  for (let c = 0; c <= COLUMNS; c++) for (let r = 0; r <= ROWS; r++) hits.push([c, r]);

  const ghostIds = [IDS.ROSE, IDS.OAK, IDS.ROCK, IDS.GRASS, IDS.ERASER];

  it.each(ghostIds)('catalog drops of %s', (id) => {
    const items = layout();
    const ghost = catalogGhost(id);
    for (const [c, r] of hits) {
      const cell = resolveDropCell({ col: c, row: r, inside: true }, ghost)!;
      const highlight = isDropValid(ghost, items, cell.col, cell.row);
      const outcome = resolveCatalogDrop(entry(id), items, cell.col, cell.row, NOW);
      expect({ c, r, valid: outcome.type !== 'blocked' }).toEqual({ c, r, valid: highlight });
    }
  });

  it('moving each placed object', () => {
    const items = layout();
    for (const item of items.filter(i => i.isDraggable)) {
      const ghost: Ghost = { kind: 'catalog', entry: item.entry };
      for (const [c, r] of hits) {
        const cell = resolveDropCell({ col: c, row: r, inside: true }, ghost)!;
        const highlight = isDropValid(ghost, items, cell.col, cell.row, item.instanceId);
        // What DraggableObject.onEnd does with the same cell:
        const blocked = findBlocker(buildOccupancy(items), cell.col, cell.row, item.gridWidth, item.gridHeight, item.instanceId) !== null;
        expect({ item: item.instanceId, c, r, valid: !blocked }).toEqual({ item: item.instanceId, c, r, valid: highlight });
      }
    }
  });

  it('the watering can', () => {
    for (const [c, r] of hits) {
      // A fresh layout per cell, because watering mutates the plant.
      const items = layout();
      const cell = resolveDropCell({ col: c, row: r, inside: true }, CAN)!;
      const highlight = isDropValid(CAN, items, cell.col, cell.row);
      // What handleWater does with the target:
      const target = findObjectAtCell(items, cell.col, cell.row);
      const watered = target instanceof PlantObject ? target.water(NOW) : false;
      expect({ c, r, valid: watered }).toEqual({ c, r, valid: highlight });
    }
  });
});

/* TERRAIN
=================================================== */
describe('applyTerrainPaint', () => {
  const frozen = (map: TerrainMap) => Object.freeze({ ...map });

  it('+ paints an empty cell, returning a new map and leaving the input untouched', () => {
    const before = frozen({});
    const after = applyTerrainPaint(before, IDS.GRASS, 2, 3);
    expect(after).toEqual({ '2,3': 'grass' });
    expect(after).not.toBe(before);
    expect(before).toEqual({});
  });

  it('+ overwrites a different terrain', () => {
    expect(applyTerrainPaint(frozen({ '2,3': 'grass' }), IDS.WATER, 2, 3)).toEqual({ '2,3': 'water' });
  });

  it('+ returns the same map when repainting the same terrain (no write needed)', () => {
    const before = frozen({ '2,3': 'sand' });
    expect(applyTerrainPaint(before, IDS.SAND, 2, 3)).toBe(before);
  });

  it('+ the eraser removes a painted cell and leaves the others', () => {
    expect(applyTerrainPaint(frozen({ '2,3': 'grass', '4,4': 'water' }), IDS.ERASER, 2, 3)).toEqual({ '4,4': 'water' });
  });

  it('+ erasing a bare cell is a no-op (same map)', () => {
    const before = frozen({ '4,4': 'water' });
    expect(applyTerrainPaint(before, IDS.ERASER, 2, 3)).toBe(before);
  });

  it.each(['t_lava', 't_', '1', '', 'grass'])('− ignores the unknown terrain id %p', (id) => {
    const before = frozen({});
    expect(applyTerrainPaint(before, id, 1, 1)).toBe(before);
  });

  it.each([
    [-1, 0], [0, -1], [COLUMNS, 0], [0, ROWS], [1.5, 2], [NaN, 0], [Infinity, 0],
  ])('− ignores the off-grid cell (%p, %p)', (col, row) => {
    const before = frozen({});
    expect(applyTerrainPaint(before, IDS.GRASS, col, row)).toBe(before);
  });

  it.each([[0, 0], [COLUMNS - 1, 0], [0, ROWS - 1], [COLUMNS - 1, ROWS - 1]])(
    '+ paints the corner cell (%i, %i) with every terrain', (col, row) => {
      for (const id of [IDS.GRASS, IDS.WATER, IDS.SAND]) {
        expect(applyTerrainPaint({}, id, col, row)).toEqual({ [`${col},${row}`]: id.slice(2) });
      }
    });

  it('+ can paint every cell on the grid', () => {
    let map: TerrainMap = {};
    for (const [c, r] of ALL_CELLS) map = applyTerrainPaint(map, IDS.GRASS, c, r);
    expect(Object.keys(map)).toHaveLength(TOTAL_CELLS);
  });
});

/* LOADING
=================================================== */
describe('parseGardenDoc', () => {
  const doc = (overrides: Record<string, unknown> = {}) => ({
    GardenTheme: 'Zen',
    PlacedItems: [
      { instanceId: 'a', catalogId: IDS.ROSE, col: 1, row: 1, plantedAt: NOW, lastWateredAt: NOW, growthStage: 0 },
      { instanceId: 'b', catalogId: IDS.ROCK, col: 2, row: 2 },
      { instanceId: 'c', catalogId: IDS.OAK, col: 4, row: 4, plantedAt: NOW, lastWateredAt: NOW, growthStage: 2 },
    ],
    Terrain: { '0,0': 'grass', '1,1': 'water' },
    ...overrides,
  });

  it('+ rebuilds every object with the right class and position', () => {
    const { name, items, terrain } = parseGardenDoc(doc(), NOW);
    expect(name).toBe('Zen');
    expect(items.map(i => [i.instanceId, i.constructor.name, i.col, i.row])).toEqual([
      ['a', 'PlantObject', 1, 1],
      ['b', 'DecorationObject', 2, 2],
      ['c', 'PlantObject', 4, 4],
    ]);
    expect(terrain).toEqual({ '0,0': 'grass', '1,1': 'water' });
  });

  it('+ round-trips: parse(toData()) gives back the same data', () => {
    const original = doc();
    const { items } = parseGardenDoc(original, NOW);
    expect(items.map(i => i.toData())).toEqual(original.PlacedItems);
  });

  it.each([undefined, '', null])('− falls back to "My Garden" for a GardenTheme of %p', (theme) => {
    expect(parseGardenDoc(doc({ GardenTheme: theme }), NOW).name).toBe('My Garden');
  });

  it.each([undefined, null, {}, 'items', 42])('− treats PlacedItems of %p as an empty garden', (value) => {
    expect(parseGardenDoc(doc({ PlacedItems: value }), NOW).items).toEqual([]);
  });

  it('− drops items whose catalog id no longer exists, including the retired sprout', () => {
    const { items } = parseGardenDoc(doc({
      PlacedItems: [
        { instanceId: 'keep', catalogId: IDS.ROCK, col: 0, row: 0 },
        { instanceId: 'sprout', catalogId: IDS.RETIRED_SPROUT, col: 1, row: 0 },
        { instanceId: 'bogus', catalogId: 'does-not-exist', col: 2, row: 0 },
        { instanceId: 'none', col: 3, row: 0 },
      ],
    }), NOW);
    expect(items.map(i => i.instanceId)).toEqual(['keep']);
  });

  it('− drops corrupt items instead of rendering them at NaN', () => {
    const { items } = parseGardenDoc(doc({
      PlacedItems: [
        { instanceId: 'ok', catalogId: IDS.ROCK, col: 0, row: 0 },
        { instanceId: 'no-col', catalogId: IDS.ROCK, row: 1 },
        { instanceId: 'nan-row', catalogId: IDS.ROCK, col: 1, row: NaN },
        { instanceId: 'string-col', catalogId: IDS.ROCK, col: '3', row: 1 },
        null,
        42,
        ['array'],
      ],
    }), NOW);
    expect(items.map(i => i.instanceId)).toEqual(['ok']);
  });

  it('+ loads a legacy plant (saved before growth existed) as mature, never thirsty', () => {
    const { items } = parseGardenDoc(doc({ PlacedItems: [{ instanceId: 'old', catalogId: IDS.OAK, col: 0, row: 0 }] }), NOW);
    const plant = items[0] as PlantObject;
    expect(plant.isMature).toBe(true);
    expect(plant.isThirsty).toBe(false);
  });

  it('+ catches a watered plant up to now, by one stage only', () => {
    const { items } = parseGardenDoc(doc({
      PlacedItems: [{
        instanceId: 'oak', catalogId: IDS.OAK, col: 0, row: 0,
        plantedAt: NOW - 60 * MINUTE, lastWateredAt: NOW - 60 * MINUTE, growthStage: 0, stageStartedAt: NOW - 60 * MINUTE,
      }],
    }), NOW);
    const oak = items[0] as PlantObject;
    expect(oak.growthStage).toBe(1); // sapling — an hour of surplus doesn't cascade to mature
    expect(oak.isThirsty).toBe(true); // and it needs watering again
  });

  it('− does not grow an unwatered plant, however long ago it was planted', () => {
    const { items } = parseGardenDoc(doc({
      PlacedItems: [{ instanceId: 'r', catalogId: IDS.ROSE, col: 0, row: 0, plantedAt: NOW - 1e9, lastWateredAt: NOW - 1e9, growthStage: 0 }],
    }), NOW);
    expect((items[0] as PlantObject).growthStage).toBe(0);
  });

  it.each([undefined, null, ['grass'], 'grass'])('− treats a Terrain field of %p as no terrain', (value) => {
    expect(parseGardenDoc(doc({ Terrain: value }), NOW).terrain).toEqual({});
  });
});
