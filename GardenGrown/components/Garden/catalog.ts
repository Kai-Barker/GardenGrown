import { TERRAIN, TERRAIN_ERASER_ID, TERRAIN_IDS, terrainCatalogId } from './terrain';
import type { CatalogEntry, ObjectKind } from './types';

/**
 * Every placeable thing in the game.
 *
 * IMPORTANT: an entry's `id` is the `catalogId` persisted in Firestore against
 * every placed instance. Ids '1'-'20' predate this module and MUST keep their
 * exact values — renumbering or reordering silently mis-maps or drops items in
 * gardens people have already built. Add new things with new ids; never reuse.
 */
const ITEM_ENTRIES: CatalogEntry[] = [
  // --- PLANTS ---
  { id: '1', kind: 'plant', name: 'Rose', image: require('../../assets/Plants/Rose.webp') },
  { id: '2', kind: 'plant', name: 'Mushroom', image: require('../../assets/Plants/Shroom.webp') },
  { id: '3', kind: 'plant', name: 'Cactus', image: require('../../assets/Plants/Cactus.webp'), isTall: true },
  { id: '4', kind: 'plant', name: 'Water Lily', image: require('../../assets/Plants/Water Lily.webp') },
  { id: '5', kind: 'plant', name: 'Red Tulip', image: require('../../assets/Plants/Red Tulip.webp') },
  { id: '6', kind: 'plant', name: 'Blue Dandelion', image: require('../../assets/Plants/Blue Dandelion.webp') },
  { id: '7', kind: 'plant', name: 'Lavender', image: require('../../assets/Plants/Lavender.webp') },
  { id: '8', kind: 'plant', name: 'Brussel Sprout', image: require('../../assets/Plants/Brussel Sprout.webp') },
  { id: '9', kind: 'plant', name: 'Pink Orchid', image: require('../../assets/Plants/Pink Orchid.webp') },
  { id: '10', kind: 'plant', name: 'Purple Vine', image: require('../../assets/Plants/Purple Vine Flower.webp') },
  // Larger plants
  { id: '11', kind: 'plant', name: 'Berry Bush', image: require('../../assets/Plants/Berry Bush.webp'), gridWidth: 1, gridHeight: 1 },
  { id: '12', kind: 'plant', name: 'Cherry Blossom', image: require('../../assets/Plants/Cherry Blossom.webp'), gridWidth: 1, gridHeight: 2, isTall: true },
  { id: '13', kind: 'plant', name: 'Oak Tree', image: require('../../assets/Plants/Oak Tree.webp'), gridWidth: 1, gridHeight: 2, isTall: true },
  { id: '14', kind: 'plant', name: 'Pink Hibiscus', image: require('../../assets/Plants/Pink Hibiscus.webp') },

  // --- DECORATIONS ---
  // '15' and '16' were categorised as Terrain before terrain became its own
  // layer. They keep their ids so existing gardens still resolve them.
  { id: '15', kind: 'decoration', name: 'Rock', image: require('../../assets/Decorations/Rock.webp'), gridWidth: 1, gridHeight: 1 },
  { id: '16', kind: 'decoration', name: 'Vertical Rock', image: require('../../assets/Decorations/Vertical Rock.webp'), isTall: true },
  { id: '17', kind: 'decoration', name: 'Stone Bench', image: require('../../assets/Decorations/Stone Bench.webp'), gridWidth: 1, gridHeight: 1 },
  { id: '18', kind: 'decoration', name: 'Wood Bench', image: require('../../assets/Decorations/Wood Bench.webp'), gridWidth: 1, gridHeight: 1 },
  { id: '19', kind: 'decoration', name: 'Stone Lantern', image: require('../../assets/Decorations/Stone Lantern.webp'), isTall: true },
  { id: '20', kind: 'decoration', name: 'Wood Lantern', image: require('../../assets/Decorations/Wood Lantern.webp'), isTall: true },
];

/** Terrain entries are derived from the terrain registry so there's one list to extend. */
const TERRAIN_ENTRIES: CatalogEntry[] = [
  ...TERRAIN_IDS.map((id) => ({
    id: terrainCatalogId(id),
    kind: 'terrain' as const,
    name: TERRAIN[id].name,
    image: TERRAIN[id].image,
  })),
  // The eraser clears a cell rather than painting it. It has no art of its own —
  // the inventory renders it as an icon tile.
  { id: TERRAIN_ERASER_ID, kind: 'terrain', name: 'Eraser', image: null },
];

export const CATALOG: CatalogEntry[] = [...ITEM_ENTRIES, ...TERRAIN_ENTRIES];

const ENTRIES_BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));

export const getEntry = (id: string | undefined): CatalogEntry | undefined =>
  id === undefined ? undefined : ENTRIES_BY_ID.get(id);

export const getEntriesByKind = (kind: ObjectKind): CatalogEntry[] =>
  CATALOG.filter((entry) => entry.kind === kind);
