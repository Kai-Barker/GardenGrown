import { simpleGrowth, woodyGrowth } from './growth';
import { TERRAIN, TERRAIN_ERASER_ID, TERRAIN_IDS, terrainCatalogId } from './terrain';
import type { CatalogEntry, ObjectKind } from './types';

/**
 * Plant art, hoisted so each image can be named once and used both as the
 * entry's image and as the final growth stage. Metro needs literal paths in
 * `require`, so these can't be built dynamically.
 */
const PLANT_ART = {
  rose: require('../../assets/Plants/Rose.webp'),
  mushroom: require('../../assets/Plants/Shroom.webp'),
  cactus: require('../../assets/Plants/Cactus.webp'),
  waterLily: require('../../assets/Plants/Water Lily.webp'),
  redTulip: require('../../assets/Plants/Red Tulip.webp'),
  blueDandelion: require('../../assets/Plants/Blue Dandelion.webp'),
  lavender: require('../../assets/Plants/Lavender.webp'),
  pinkOrchid: require('../../assets/Plants/Pink Orchid.webp'),
  purpleVine: require('../../assets/Plants/Purple Vine Flower.webp'),
  berryBush: require('../../assets/Plants/Berry Bush.webp'),
  cherryBlossom: require('../../assets/Plants/Cherry Blossom.webp'),
  oakTree: require('../../assets/Plants/Oak Tree.webp'),
  pinkHibiscus: require('../../assets/Plants/Pink Hibiscus.webp'),
  daffodil: require('../../assets/Plants/Daffodil.webp'),
  mistletoe: require('../../assets/Plants/Mistletoe.webp'),
  orangePepperFlower: require('../../assets/Plants/Orange Pepper Flower.webp'),
  pinkPigEars: require('../../assets/Plants/Pink Pig Ears Flower.webp'),
  pinkCircleFlower: require('../../assets/Plants/Pink circle flower.webp'),
  pinkFlowerAndGrass: require('../../assets/Plants/Pink flower and grass.webp'),
  pinkFlowerOnLeaves: require('../../assets/Plants/Pink flower on leaves.webp'),
  pinkSphereFlower: require('../../assets/Plants/Pink sphere flower.webp'),
  redAlienFlower: require('../../assets/Plants/Red Alien FLower.webp'),
  redFlower: require('../../assets/Plants/Red Flower.webp'),
  redWavyFlower: require('../../assets/Plants/Red Wavy Flower.webp'),
  redSadCasingFlower: require('../../assets/Plants/Red sad casing flower.webp'),
  purpleScreamingFlower: require('../../assets/Plants/purple screaming flower.webp'),
};

/**
 * Every placeable thing in the game.
 *
 * IMPORTANT: an entry's `id` is the `catalogId` persisted in Firestore against
 * every placed instance. Ids '1'-'20' predate this module and MUST keep their
 * exact values — renumbering or reordering silently mis-maps or drops items in
 * gardens people have already built. Add new things with new ids; never reuse.
 *
 * Plants carry `growthStages`, whose final stage is the plant's own art — so a
 * grown garden looks unchanged. Flowers use `simpleGrowth` (seed -> mature);
 * trees and the larger woody plants use `woodyGrowth`, which adds a sapling in
 * between since jumping straight to a full canopy looks abrupt.
 */
const ITEM_ENTRIES: CatalogEntry[] = [
  // --- PLANTS ---
  { id: '1', kind: 'plant', name: 'Rose', image: PLANT_ART.rose, growthStages: simpleGrowth(PLANT_ART.rose) },
  { id: '2', kind: 'plant', name: 'Mushroom', image: PLANT_ART.mushroom, growthStages: simpleGrowth(PLANT_ART.mushroom) },
  { id: '3', kind: 'plant', name: 'Cactus', image: PLANT_ART.cactus, isTall: true, growthStages: woodyGrowth(PLANT_ART.cactus) },
  { id: '4', kind: 'plant', name: 'Water Lily', image: PLANT_ART.waterLily, growthStages: simpleGrowth(PLANT_ART.waterLily) },
  { id: '5', kind: 'plant', name: 'Red Tulip', image: PLANT_ART.redTulip, growthStages: simpleGrowth(PLANT_ART.redTulip) },
  { id: '6', kind: 'plant', name: 'Blue Dandelion', image: PLANT_ART.blueDandelion, growthStages: simpleGrowth(PLANT_ART.blueDandelion) },
  { id: '7', kind: 'plant', name: 'Lavender', image: PLANT_ART.lavender, growthStages: simpleGrowth(PLANT_ART.lavender) },
  // '8' was Brussel Sprout, retired as a placeable — its art is now the shared
  // sapling stage in growth.ts. The id stays burned so it can't be reused, and
  // any already-placed sprout resolves to nothing and is dropped on load.
  { id: '9', kind: 'plant', name: 'Pink Orchid', image: PLANT_ART.pinkOrchid, growthStages: simpleGrowth(PLANT_ART.pinkOrchid) },
  { id: '10', kind: 'plant', name: 'Purple Vine', image: PLANT_ART.purpleVine, growthStages: simpleGrowth(PLANT_ART.purpleVine) },
  // Larger plants — woody enough to earn a sapling stage.
  { id: '11', kind: 'plant', name: 'Berry Bush', image: PLANT_ART.berryBush, gridWidth: 1, gridHeight: 1, growthStages: woodyGrowth(PLANT_ART.berryBush) },
  { id: '12', kind: 'plant', name: 'Cherry Blossom', image: PLANT_ART.cherryBlossom, gridWidth: 1, gridHeight: 2, isTall: true, growthStages: woodyGrowth(PLANT_ART.cherryBlossom) },
  { id: '13', kind: 'plant', name: 'Oak Tree', image: PLANT_ART.oakTree, gridWidth: 1, gridHeight: 2, isTall: true, growthStages: woodyGrowth(PLANT_ART.oakTree) },
  { id: '14', kind: 'plant', name: 'Pink Hibiscus', image: PLANT_ART.pinkHibiscus, growthStages: simpleGrowth(PLANT_ART.pinkHibiscus) },

  // Ids resume at '21' — '15'-'20' are the decorations below.
  { id: '21', kind: 'plant', name: 'Daffodil', image: PLANT_ART.daffodil, growthStages: simpleGrowth(PLANT_ART.daffodil) },
  { id: '22', kind: 'plant', name: 'Mistletoe', image: PLANT_ART.mistletoe, growthStages: simpleGrowth(PLANT_ART.mistletoe) },
  { id: '23', kind: 'plant', name: 'Orange Pepper Flower', image: PLANT_ART.orangePepperFlower, growthStages: simpleGrowth(PLANT_ART.orangePepperFlower) },
  { id: '24', kind: 'plant', name: 'Pink Pig Ears', image: PLANT_ART.pinkPigEars, growthStages: simpleGrowth(PLANT_ART.pinkPigEars) },
  { id: '25', kind: 'plant', name: 'Pink Circle Flower', image: PLANT_ART.pinkCircleFlower, growthStages: simpleGrowth(PLANT_ART.pinkCircleFlower) },
  { id: '26', kind: 'plant', name: 'Pink Flower and Grass', image: PLANT_ART.pinkFlowerAndGrass, growthStages: simpleGrowth(PLANT_ART.pinkFlowerAndGrass) },
  { id: '27', kind: 'plant', name: 'Pink Flower on Leaves', image: PLANT_ART.pinkFlowerOnLeaves, growthStages: simpleGrowth(PLANT_ART.pinkFlowerOnLeaves) },
  { id: '28', kind: 'plant', name: 'Pink Sphere Flower', image: PLANT_ART.pinkSphereFlower, growthStages: simpleGrowth(PLANT_ART.pinkSphereFlower) },
  { id: '29', kind: 'plant', name: 'Red Alien Flower', image: PLANT_ART.redAlienFlower, growthStages: simpleGrowth(PLANT_ART.redAlienFlower) },
  { id: '30', kind: 'plant', name: 'Red Flower', image: PLANT_ART.redFlower, growthStages: simpleGrowth(PLANT_ART.redFlower) },
  { id: '31', kind: 'plant', name: 'Red Wavy Flower', image: PLANT_ART.redWavyFlower, growthStages: simpleGrowth(PLANT_ART.redWavyFlower) },
  { id: '32', kind: 'plant', name: 'Red Sad Casing Flower', image: PLANT_ART.redSadCasingFlower, growthStages: simpleGrowth(PLANT_ART.redSadCasingFlower) },
  { id: '33', kind: 'plant', name: 'Purple Screaming Flower', image: PLANT_ART.purpleScreamingFlower, growthStages: simpleGrowth(PLANT_ART.purpleScreamingFlower) },

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
