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
 * the plant is mature the moment it's placed.
 */
export type GrowthStage = {
  image: any;
  /**
   * How long this stage lasts once watered, in hours — a duration, not a
   * deadline. Total time to maturity is the sum of every stage's value, and
   * each stage's clock only starts when the plant is watered.
   *
   * Unused on the final stage, since nothing follows it.
   */
  hoursToNextStage: number;
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
  /**
   * When the current stage's clock started — i.e. when the plant was last
   * watered. Undefined means thirsty: the plant is waiting for water and isn't
   * growing. Storing the time rather than a bare "is watered" flag is what lets
   * growth accrue while the app is closed.
   */
  stageStartedAt?: number;
};

/** "col,row" -> terrain id. One tile per cell, stored flat for cheap per-cell writes. */
export type TerrainMap = Record<string, TerrainId>;
