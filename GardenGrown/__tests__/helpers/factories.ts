import { getEntry } from '../../components/Garden/catalog';
import { DecorationObject, PlantObject, TerrainTile } from '../../components/Garden/objects';
import type { CatalogEntry } from '../../components/Garden/types';

/** A fixed "now" so time-dependent tests are deterministic. */
export const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;

/** Catalog ids used throughout the suite, named for readability. */
export const IDS = {
  ROSE: '1', // 1x1 plant, simple growth (seed -> mature)
  CACTUS: '3', // 1x1 tall plant, woody growth (seed -> sapling -> mature)
  OAK: '13', // 1x2 tall plant, woody growth
  CHERRY: '12', // 1x2 tall plant, woody growth
  ROCK: '15', // 1x1 decoration
  LANTERN: '19', // 1x1 tall decoration
  GRASS: 't_grass',
  WATER: 't_water',
  SAND: 't_sand',
  ERASER: 't_none',
  RETIRED_SPROUT: '8', // removed from the catalog; must be dropped on load
} as const;

/** A real catalog entry, failing loudly if the id doesn't exist. */
export const entry = (id: string): CatalogEntry => {
  const found = getEntry(id);
  if (!found) throw new Error(`No catalog entry with id "${id}"`);
  return found;
};

/** A synthetic entry, for footprints the real catalog doesn't have (e.g. 2x2). */
export const fakeEntry = (overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'id' | 'kind'>): CatalogEntry => ({
  name: overrides.id,
  image: null,
  ...overrides,
});

export const makePlant = (
  instanceId: string,
  col: number,
  row: number,
  catalogId: string = IDS.ROSE,
  state: ConstructorParameters<typeof PlantObject>[4] = { plantedAt: NOW, lastWateredAt: NOW, growthStage: 0 },
) => new PlantObject(instanceId, entry(catalogId), col, row, state);

export const makeMaturePlant = (instanceId: string, col: number, row: number, catalogId: string = IDS.ROSE) => {
  const e = entry(catalogId);
  return new PlantObject(instanceId, e, col, row, {
    plantedAt: NOW,
    lastWateredAt: NOW,
    growthStage: (e.growthStages?.length ?? 1) - 1,
  });
};

export const makeDecoration = (instanceId: string, col: number, row: number, catalogId: string = IDS.ROCK) =>
  new DecorationObject(instanceId, entry(catalogId), col, row);

export const makeTerrainTile = (instanceId: string, col: number, row: number, catalogId: string = IDS.GRASS) =>
  new TerrainTile(instanceId, entry(catalogId), col, row);
