/**
 * Shared types for the garden's placeable-object model.
 *
 * The split to keep in mind: a CatalogEntry is the immutable *definition* of a
 * thing that can be placed (its art, its footprint), while PlacedObjectData is
 * the per-instance state of one of those things actually sitting in a garden.
 * Only the latter is persisted — render fields are rehydrated from the catalog.
 */

export type ObjectKind = 'plant' | 'decoration' | 'terrain';

export type TerrainId = 'grass' | 'water' | 'sand';

/**
 * One step in a plant's life. Empty/absent growthStages on a catalog entry means
 * the plant is mature the moment it's placed, which is every plant today.
 */
export type GrowthStage = {
  image: any;
  /** hours of (watered) growth after planting before this stage is reached */
  hoursRequired: number;
  /**
   * Renders this stage at a fixed size in cells instead of the plant's own
   * footprint. A seed is a seed whether it grows into a tulip or an oak, so
   * early stages set this to stay small rather than inheriting a tree's box.
   * Omitted on the final stage, which renders at the plant's real size.
   */
  visualCells?: number;
};

export type CatalogEntry = {
  id: string;
  kind: ObjectKind;
  name: string;
  image: any;
  gridWidth?: number;
  gridHeight?: number;
  /** renders taller than its footprint — purely visual, doesn't change occupancy */
  isTall?: boolean;
  /** plants only */
  growthStages?: GrowthStage[];
};

/**
 * The persisted shape of a placed object. `instanceId`/`catalogId`/`col`/`row`
 * have been stored since the first version; the growth fields are optional so
 * existing documents keep loading untouched.
 */
export type PlacedObjectData = {
  instanceId: string;
  catalogId: string;
  col: number;
  row: number;
  plantedAt?: number;
  lastWateredAt?: number;
  growthStage?: number;
};

/** "col,row" -> terrain id. One tile per cell, stored flat for cheap per-cell writes. */
export type TerrainMap = Record<string, TerrainId>;
