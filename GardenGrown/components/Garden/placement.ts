import { CELL_SIZE, COLUMNS, ROWS, cellKey } from './constants';
import { getEntry } from './catalog';
import { DecorationObject, PlacedObject, PlantObject } from './objects';
import { TERRAIN, terrainIdFromCatalogId } from './terrain';
import type { CatalogEntry, PlacedObjectData, TerrainMap } from './types';

/**
 * The garden's placement rules, as pure functions.
 *
 * These used to be written out inline — and repeated — across the garden
 * screen's gesture handlers: the drop highlight, the inventory drop, moving a
 * placed object, the watering can and terrain painting each had their own copy
 * of the clamp and collision maths. Keeping them here means there is one
 * implementation for the highlight and the drop to agree on, and it can be
 * tested without rendering anything.
 *
 * WORKLETS: `clampToGrid`, `findBlocker` and `snapFromTranslation` are called
 * from a Reanimated gesture callback, which runs on the UI thread. They carry a
 * 'worklet' directive and may only call other worklets — which is why
 * `findBlocker` builds its cell keys inline rather than calling `cellKey`.
 */

/** What's being dragged over the garden right now. */
export type Ghost =
  | { kind: 'catalog'; entry: CatalogEntry }
  | { kind: 'can' };

export type GridRect = { pageX: number; pageY: number; width: number; height: number };

export type CellHit = { col: number; row: number; inside: boolean };

/* SCREEN -> GRID
=================================================== */

/**
 * Converts a screen touch into a grid cell, given the grid's measured rect and
 * the ScrollView's current zoom.
 *
 * measure() mixes two coordinate conventions inside a zoomed ScrollView, which
 * is what made this subtle:
 *
 *   - pageX/pageY ARE transformed — real screen coords, and strongly negative
 *     at high zoom because the grid's origin is scrolled off-screen.
 *   - width/height are NOT transformed — they stay at the layout size
 *     (measured 342 = GRID_WIDTH at 3x zoom).
 *
 * So the on-screen size has to be reconstructed as width * zoom. Comparing a
 * screen touch against the raw width instead makes the bounds check reject
 * every touch while zoomed, silently refusing all placement.
 */
export const screenToCell = (
  absoluteX: number,
  absoluteY: number,
  rect: GridRect,
  zoom: number,
  cellSize: number = CELL_SIZE,
): CellHit => {
  const scale = zoom > 0 ? zoom : 1;

  // The grid's actual on-screen footprint.
  const screenWidth = rect.width * scale;
  const screenHeight = rect.height * scale;
  const cell = cellSize * scale;

  return {
    col: Math.floor((absoluteX - rect.pageX) / cell),
    row: Math.floor((absoluteY - rect.pageY) / cell),
    inside:
      absoluteX >= rect.pageX && absoluteX <= rect.pageX + screenWidth &&
      absoluteY >= rect.pageY && absoluteY <= rect.pageY + screenHeight,
  };
};

/* GRID GEOMETRY (worklets)
=================================================== */

/**
 * Pulls a footprint's top-left cell back inside the grid, so an item dropped
 * half off an edge lands flush against it instead of overhanging.
 */
export function clampToGrid(col: number, row: number, width: number, height: number) {
  'worklet';
  return {
    col: Math.max(0, Math.min(col, COLUMNS - width)),
    row: Math.max(0, Math.min(row, ROWS - height)),
  };
}

/**
 * The first object blocking a `width` x `height` footprint at (col, row), or
 * null if every cell is free. `ignoreId` is the object being moved, so it
 * doesn't collide with the cells it's currently sitting in.
 */
export function findBlocker(
  occupied: Record<string, string>,
  col: number,
  row: number,
  width: number,
  height: number,
  ignoreId: string | null = null,
): string | null {
  'worklet';
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) {
      // Inline rather than cellKey(): this runs on the UI thread, where only
      // worklets can be called. Must stay in step with cellKey's format.
      const blocker = occupied[`${col + c},${row + r}`];
      if (blocker && blocker !== ignoreId) return blocker;
    }
  }
  return null;
}

/**
 * Where a dragged object settles: its translation (in layout pixels) rounded to
 * the nearest cell, then clamped so the whole footprint stays on the grid.
 */
export function snapFromTranslation(
  x: number,
  y: number,
  cellSize: number,
  width: number,
  height: number,
) {
  'worklet';
  return clampToGrid(Math.round(x / cellSize), Math.round(y / cellSize), width, height);
}

/* OCCUPANCY
=================================================== */

/**
 * "col,row" -> instanceId, for collision checks. Objects that don't block
 * (terrain) are skipped, so a plant can be placed on a painted cell.
 */
export const buildOccupancy = (items: PlacedObject[]): Record<string, string> => {
  const map: Record<string, string> = {};
  items.forEach(item => {
    if (!item.blocksPlacement) return;
    item.occupiedCells().forEach(key => {
      map[key] = item.instanceId;
    });
  });
  return map;
};

/** The blocking object covering a cell, anywhere in its footprint, if any. */
export const findObjectAtCell = (
  items: PlacedObject[],
  col: number,
  row: number,
): PlacedObject | null => {
  const key = cellKey(col, row);
  return items.find(item => item.blocksPlacement && item.occupiedCells().includes(key)) ?? null;
};

/* DROPS
=================================================== */

/** How many cells a ghost covers. The can and terrain only ever target one. */
const ghostSpan = (ghost: Ghost) => {
  if (ghost.kind === 'can' || ghost.entry.kind === 'terrain') return { width: 1, height: 1 };
  return { width: ghost.entry.gridWidth ?? 1, height: ghost.entry.gridHeight ?? 1 };
};

/**
 * The cell a drop at `hit` targets: clamped so the ghost's whole footprint fits,
 * or null when the touch is off the grid. The highlight and every drop handler
 * go through this, so the highlight can't sit somewhere the item won't land.
 */
export const resolveDropCell = (hit: CellHit, ghost: Ghost): { col: number; row: number } | null => {
  if (!hit.inside) return null;
  const { width, height } = ghostSpan(ghost);
  return clampToGrid(hit.col, hit.row, width, height);
};

/**
 * Whether releasing `ghost` at (col, row) would do anything — the drop
 * highlight's colour.
 *
 *   - the can: only a thirsty plant can be watered
 *   - terrain: paints its own layer, so it's always valid
 *   - anything else: every cell of its footprint must be free, ignoring
 *     `movingId` (an object being repositioned can overlap its own cells)
 */
export const isDropValid = (
  ghost: Ghost,
  items: PlacedObject[],
  col: number,
  row: number,
  movingId: string | null = null,
): boolean => {
  if (ghost.kind === 'can') {
    const target = findObjectAtCell(items, col, row);
    return target instanceof PlantObject && target.isThirsty;
  }

  if (ghost.entry.kind === 'terrain') return true;

  const { width, height } = ghostSpan(ghost);
  return findBlocker(buildOccupancy(items), col, row, width, height, movingId) === null;
};

/**
 * A fresh instance id. Ids have always been the placement timestamp; two drops
 * in the same millisecond would collide, so a suffix keeps them unique.
 */
const nextInstanceId = (items: PlacedObject[], now: number): string => {
  const taken = new Set(items.map(item => item.instanceId));
  const base = String(now);
  if (!taken.has(base)) return base;

  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

/**
 * Builds the object a catalog drop creates. Plants start at their first stage
 * with no stageStartedAt — thirsty, so they won't grow until watered. Returns
 * null for terrain, which is painted rather than placed.
 */
export const createPlacedObject = (
  entry: CatalogEntry,
  col: number,
  row: number,
  existingItems: PlacedObject[],
  now: number = Date.now(),
): PlacedObject | null => {
  const instanceId = nextInstanceId(existingItems, now);

  switch (entry.kind) {
    case 'plant':
      return new PlantObject(instanceId, entry, col, row, {
        plantedAt: now,
        lastWateredAt: now,
        growthStage: 0,
      });
    case 'decoration':
      return new DecorationObject(instanceId, entry, col, row);
    default:
      return null;
  }
};

export type CatalogDropResult =
  | { type: 'paint'; catalogId: string; col: number; row: number }
  | { type: 'blocked'; blockerId: string }
  | { type: 'place'; item: PlacedObject };

/**
 * What dropping a catalog entry at (col, row) does: paint terrain, get refused
 * because something is in the way, or place a new object.
 */
export const resolveCatalogDrop = (
  entry: CatalogEntry,
  items: PlacedObject[],
  col: number,
  row: number,
  now: number = Date.now(),
): CatalogDropResult => {
  // Terrain paints its own layer, so it never collides with what's already on
  // the cell — planting on grass is the whole point.
  if (entry.kind === 'terrain') return { type: 'paint', catalogId: entry.id, col, row };

  const blockerId = findBlocker(
    buildOccupancy(items),
    col,
    row,
    entry.gridWidth ?? 1,
    entry.gridHeight ?? 1,
  );
  if (blockerId) return { type: 'blocked', blockerId };

  const item = createPlacedObject(entry, col, row, items, now);
  // Unreachable for the catalog's kinds, but a kind added later without a
  // branch in createPlacedObject should be refused, not crash.
  if (!item) return { type: 'blocked', blockerId: '' };
  return { type: 'place', item };
};

/* TERRAIN
=================================================== */

const isOnGrid = (col: number, row: number) =>
  Number.isInteger(col) && Number.isInteger(row) &&
  col >= 0 && col < COLUMNS && row >= 0 && row < ROWS;

/**
 * Paints (or, for the eraser, clears) one terrain cell, returning a new map.
 *
 * Returns the SAME map when nothing would change — an unknown terrain id, a cell
 * off the grid, or erasing an already-bare cell — so callers can skip the
 * re-render and the Firestore write.
 */
export const applyTerrainPaint = (
  terrain: TerrainMap,
  catalogId: string,
  col: number,
  row: number,
): TerrainMap => {
  if (!isOnGrid(col, row)) return terrain;

  const key = cellKey(col, row);
  const terrainId = terrainIdFromCatalogId(catalogId);

  if (terrainId === null) {
    if (!(key in terrain)) return terrain;
    const updated = { ...terrain };
    delete updated[key];
    return updated;
  }

  // terrainIdFromCatalogId trusts its input, so 't_lava' comes back as 'lava'.
  // Only paint terrain that actually exists.
  if (!(terrainId in TERRAIN)) return terrain;
  if (terrain[key] === terrainId) return terrain;

  return { ...terrain, [key]: terrainId };
};

/* LOADING
=================================================== */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Turns a garden document into what the screen renders.
 *
 *   - items whose catalogId no longer exists (e.g. the retired '8') are dropped,
 *     as are corrupt items without finite coordinates
 *   - growth accrues while the app is closed, so every plant is caught up to
 *     `now` before the first render
 *   - gardens created before terrain existed have no Terrain field
 */
export const parseGardenDoc = (data: Record<string, any>, now: number = Date.now()) => {
  const rawItems: unknown[] = Array.isArray(data.PlacedItems) ? data.PlacedItems : [];

  const items = rawItems
    .filter((raw): raw is PlacedObjectData =>
      isPlainObject(raw) && Number.isFinite(raw.col) && Number.isFinite(raw.row))
    .map(raw => PlacedObject.fromData(raw, getEntry(raw.catalogId)))
    .filter((item): item is PlacedObject => item !== null);

  items.forEach(item => {
    if (item instanceof PlantObject) item.advanceGrowth(now);
  });

  return {
    name: (data.GardenTheme as string) || 'My Garden',
    items,
    terrain: (isPlainObject(data.Terrain) ? data.Terrain : {}) as TerrainMap,
  };
};
