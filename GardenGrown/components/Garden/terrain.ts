import type { TerrainId } from './types';

/**
 * The terrain tiles a cell can be painted with.
 *
 * A cell with no entry in the TerrainMap draws nothing and the grid's own
 * background shows through, so "bare earth" needs no tile of its own.
 */
export const TERRAIN: Record<TerrainId, { id: TerrainId; name: string; image: any }> = {
  grass: {
    id: 'grass',
    name: 'Grass',
    image: require('../../assets/Terrain/Grass.webp'),
  },
  water: {
    id: 'water',
    name: 'Water',
    image: require('../../assets/Terrain/Water.webp'),
  },
  sand: {
    id: 'sand',
    name: 'Sand',
    image: require('../../assets/Terrain/Sand.webp'),
  },
};

export const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];

/** Catalog id prefix for terrain, so terrain ids can't collide with item ids. */
export const TERRAIN_CATALOG_PREFIX = 't_';

/** Catalog id of the eraser, which clears a cell's terrain instead of painting it. */
export const TERRAIN_ERASER_ID = 't_none';

export const terrainCatalogId = (id: TerrainId) => `${TERRAIN_CATALOG_PREFIX}${id}`;

/**
 * Maps a terrain catalog id back to the terrain it paints. Returns null for the
 * eraser, which is the signal to delete the cell's entry rather than set one.
 */
export const terrainIdFromCatalogId = (catalogId: string): TerrainId | null => {
  if (catalogId === TERRAIN_ERASER_ID) return null;
  return catalogId.slice(TERRAIN_CATALOG_PREFIX.length) as TerrainId;
};
