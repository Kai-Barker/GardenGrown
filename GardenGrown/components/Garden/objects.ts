import { cellKey } from './constants';
import type { CatalogEntry, GrowthStage, ObjectKind, PlacedObjectData } from './types';

/**
 * Base class for anything that can sit on the garden grid.
 *
 * Subclasses exist so placed things can *behave* differently rather than just
 * look different: whether they reserve their cells, which layer they paint on,
 * whether they can be dragged, and what image they show right now. Adding a new
 * kind of placeable should mean adding a subclass here and entries to the
 * catalog — nothing in the garden screen needs to know about it.
 */
export abstract class PlacedObject {
  readonly instanceId: string;
  readonly entry: CatalogEntry;
  col: number;
  row: number;

  abstract readonly kind: ObjectKind;

  constructor(instanceId: string, entry: CatalogEntry, col: number, row: number) {
    this.instanceId = instanceId;
    this.entry = entry;
    this.col = col;
    this.row = row;
  }

  /** Does this reserve its cells against other objects? */
  get blocksPlacement(): boolean {
    return true;
  }

  /** Paint order within the grid. Terrain is 0; everything else sits above it. */
  get layer(): number {
    return 1;
  }

  get isDraggable(): boolean {
    return true;
  }

  get gridWidth(): number {
    return this.entry.gridWidth ?? 1;
  }

  get gridHeight(): number {
    return this.entry.gridHeight ?? 1;
  }

  get isTall(): boolean {
    return this.entry.isTall ?? false;
  }

  /**
   * The image to draw right now. Static for most things; PlantObject overrides
   * this to resolve the current growth stage.
   */
  getImage(): any {
    return this.entry.image;
  }

  /** Every cell this object covers, as cellKey strings. */
  occupiedCells(): string[] {
    const keys: string[] = [];
    for (let c = 0; c < this.gridWidth; c++) {
      for (let r = 0; r < this.gridHeight; r++) {
        keys.push(cellKey(this.col + c, this.row + r));
      }
    }
    return keys;
  }

  /** Position is the only mutable part of the base state. */
  moveTo(col: number, row: number): this {
    this.col = col;
    this.row = row;
    return this;
  }

  toData(): PlacedObjectData {
    return {
      instanceId: this.instanceId,
      catalogId: this.entry.id,
      col: this.col,
      row: this.row,
    };
  }

  /**
   * Rebuilds an object from its persisted state. Returns null when the entry is
   * missing — a catalogId that no longer exists in the catalog — which callers
   * filter out, preserving the screen's long-standing "silently drop unknown
   * items" behaviour.
   */
  static fromData(data: PlacedObjectData, entry: CatalogEntry | undefined): PlacedObject | null {
    if (!entry) return null;

    switch (entry.kind) {
      case 'plant':
        return new PlantObject(data.instanceId, entry, data.col, data.row, {
          plantedAt: data.plantedAt,
          lastWateredAt: data.lastWateredAt,
          growthStage: data.growthStage,
          stageStartedAt: data.stageStartedAt,
        });
      case 'decoration':
        return new DecorationObject(data.instanceId, entry, data.col, data.row);
      case 'terrain':
        return new TerrainTile(data.instanceId, entry, data.col, data.row);
      default:
        return null;
    }
  }
}

export class DecorationObject extends PlacedObject {
  readonly kind = 'decoration' as const;
}

type PlantState = {
  plantedAt?: number;
  lastWateredAt?: number;
  growthStage?: number;
  stageStartedAt?: number;
};

export class PlantObject extends PlacedObject {
  readonly kind = 'plant' as const;

  plantedAt: number;
  lastWateredAt: number;
  growthStage: number;

  /**
   * When the current stage's clock started. Undefined means thirsty — the plant
   * is waiting to be watered and isn't growing.
   */
  stageStartedAt?: number;

  constructor(
    instanceId: string,
    entry: CatalogEntry,
    col: number,
    row: number,
    state: PlantState = {},
  ) {
    super(instanceId, entry, col, row);

    const now = Date.now();
    this.plantedAt = state.plantedAt ?? now;
    this.lastWateredAt = state.lastWateredAt ?? now;

    // Plants saved before growth existed carry no growthStage. Default those to
    // mature rather than 0, so nobody's already-grown garden regresses to
    // sprouts the moment stage art ships.
    this.growthStage = state.growthStage ?? PlantObject.finalStage(entry);
    this.stageStartedAt = state.stageStartedAt;
  }

  private static finalStage(entry: CatalogEntry): number {
    return Math.max(0, (entry.growthStages?.length ?? 0) - 1);
  }

  /** The stage currently being displayed, clamped into range. */
  private currentStage(): GrowthStage | undefined {
    const stages = this.entry.growthStages;
    if (!stages?.length) return undefined;
    return stages[Math.min(this.growthStage, stages.length - 1)];
  }

  /** Stage art where it exists, the full-grown image otherwise. */
  getImage(): any {
    return this.currentStage()?.image ?? this.entry.image;
  }

  /**
   * Fixed render size in cells for the current stage, or undefined to use the
   * plant's own footprint. Keeps a seed seed-sized on a tree as well as a herb.
   */
  getVisualCells(): number | undefined {
    return this.currentStage()?.visualCells;
  }

  get isMature(): boolean {
    return this.growthStage >= PlantObject.finalStage(this.entry);
  }

  /**
   * Waiting for water: not fully grown, and its clock isn't running. A mature
   * plant is never thirsty — it's finished, not waiting.
   */
  get isThirsty(): boolean {
    return !this.isMature && this.stageStartedAt === undefined;
  }

  /**
   * Starts the current stage's clock. Returns whether it actually did anything,
   * so callers can skip a pointless re-render and Firestore write.
   *
   * One watering per stage: a plant that's already growing, or fully grown,
   * ignores further watering rather than restarting its timer.
   */
  water(now: number = Date.now()): boolean {
    if (this.isMature || this.stageStartedAt !== undefined) return false;

    this.stageStartedAt = now;
    this.lastWateredAt = now;
    return true;
  }

  /**
   * Advances one stage if the current stage's watered duration has elapsed.
   *
   * Advancing clears the clock, so the next stage needs its own watering — an
   * oak goes seed -> (water) -> sapling -> (water) -> mature. Surplus time past
   * the threshold is deliberately discarded rather than carried forward, since
   * rolling it over would let one watering cascade a plant through several
   * stages at once.
   */
  advanceGrowth(now: number = Date.now()): this {
    const stages = this.entry.growthStages;
    if (!stages?.length) return this;

    // Not watered, or nothing left to grow into.
    if (this.stageStartedAt === undefined || this.isMature) return this;

    const durationMs = stages[this.growthStage].hoursToNextStage * 60 * 60 * 1000;
    if (now - this.stageStartedAt < durationMs) return this;

    this.growthStage += 1;
    this.stageStartedAt = undefined;
    return this;
  }

  toData(): PlacedObjectData {
    const data: PlacedObjectData = {
      ...super.toData(),
      plantedAt: this.plantedAt,
      lastWateredAt: this.lastWateredAt,
      growthStage: this.growthStage,
    };

    // Firestore rejects undefined values outright, so a thirsty plant omits the
    // key rather than writing it empty. Absent and undefined read back the same
    // through the constructor.
    if (this.stageStartedAt !== undefined) {
      data.stageStartedAt = this.stageStartedAt;
    }

    return data;
  }
}

/**
 * A single terrain tile.
 *
 * Terrain is part of the hierarchy so future variants (a 2x2 pond, an animated
 * water tile) have somewhere to live, and so the "what layer does this paint
 * on" question has one answer for every placeable. It is *stored* as the flat
 * TerrainMap rather than in the PlacedItems array, which keeps painting a cell
 * a single-key write instead of an array scan.
 */
export class TerrainTile extends PlacedObject {
  readonly kind = 'terrain' as const;

  /** Terrain never blocks — a plant can be planted on grass. */
  get blocksPlacement(): boolean {
    return false;
  }

  /** Always painted beneath plants and decorations. */
  get layer(): number {
    return 0;
  }

  /** Terrain is painted and erased, not dragged around. */
  get isDraggable(): boolean {
    return false;
  }
}
