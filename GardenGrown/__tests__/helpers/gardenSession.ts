import { CELL_SIZE, COLUMNS, ROWS } from '../../components/Garden/constants';
import { PlantObject, type PlacedObject } from '../../components/Garden/objects';
import {
  applyTerrainPaint,
  buildOccupancy,
  findBlocker,
  findObjectAtCell,
  isDropValid,
  parseGardenDoc,
  resolveCatalogDrop,
  resolveDropCell,
  screenToCell,
  snapFromTranslation,
  type Ghost,
} from '../../components/Garden/placement';
import type { TerrainMap } from '../../components/Garden/types';
import { getGarden, saveGardenLayout } from '../../services/garden';
import { entry } from './factories';

/**
 * Drives one open garden the way app/garden.tsx does, without rendering it.
 *
 * Every action starts from a *screen touch* — through screenToCell, the drop
 * clamp, the highlight and the drop resolution — then saves exactly when the
 * screen saves. Gestures themselves (pan/pinch) can't run outside a device, so
 * that last mile is covered by the manual Expo Go check.
 */
export class GardenSession {
  items: PlacedObject[] = [];
  terrain: TerrainMap = {};
  name = '';

  /** Where the grid sits on screen, and the ScrollView zoom. */
  rect = { pageX: 24, pageY: 180, width: COLUMNS * CELL_SIZE, height: ROWS * CELL_SIZE };
  zoom = 1;

  constructor(readonly gardenId: string, public now: number) {}

  /** handleOpen: fetch + parseGardenDoc. */
  async open() {
    const data = await getGarden(this.gardenId);
    if (!data) throw new Error(`Garden ${this.gardenId} does not exist`);
    const parsed = parseGardenDoc(data, this.now);
    this.name = parsed.name;
    this.items = parsed.items;
    this.terrain = parsed.terrain;
    return this;
  }

  /** The screen point at the centre of a cell, at the current zoom. */
  touchAt(col: number, row: number) {
    return {
      x: this.rect.pageX + (col + 0.5) * CELL_SIZE * this.zoom,
      y: this.rect.pageY + (row + 0.5) * CELL_SIZE * this.zoom,
    };
  }

  private cellUnder(x: number, y: number, ghost: Ghost) {
    return resolveDropCell(screenToCell(x, y, this.rect, this.zoom), ghost);
  }

  /** What the highlight would show while hovering a cell. */
  highlight(catalogId: string | 'can', col: number, row: number, movingId: string | null = null) {
    const ghost: Ghost = catalogId === 'can' ? { kind: 'can' } : { kind: 'catalog', entry: entry(catalogId) };
    const { x, y } = this.touchAt(col, row);
    const cell = this.cellUnder(x, y, ghost);
    return cell ? { ...cell, valid: isDropValid(ghost, this.items, cell.col, cell.row, movingId) } : null;
  }

  /** handleInventoryDragEnd: drag a catalog item from the inventory onto a cell. */
  async dropFromInventory(catalogId: string, col: number, row: number) {
    const e = entry(catalogId);
    const { x, y } = this.touchAt(col, row);
    const cell = this.cellUnder(x, y, { kind: 'catalog', entry: e });
    if (!cell) return 'off-grid' as const;

    const result = resolveCatalogDrop(e, this.items, cell.col, cell.row, this.now);
    if (result.type === 'paint') return this.paint(result.catalogId, result.col, result.row);
    if (result.type === 'blocked') return 'blocked' as const;

    this.items = [...this.items, result.item];
    await this.save();
    return result.item;
  }

  /** handlePaintTerrain. */
  private async paint(catalogId: string, col: number, row: number) {
    const updated = applyTerrainPaint(this.terrain, catalogId, col, row);
    if (updated === this.terrain) return 'unchanged' as const;
    this.terrain = updated;
    await this.save();
    return 'painted' as const;
  }

  /** DraggableObject.onEnd + handleSnap: drag a placed object to another cell. */
  async move(instanceId: string, toCol: number, toRow: number) {
    const item = this.items.find(i => i.instanceId === instanceId);
    if (!item) throw new Error(`No item ${instanceId}`);

    // The object's translation in layout pixels when the finger lifts.
    const { col, row } = snapFromTranslation(toCol * CELL_SIZE, toRow * CELL_SIZE, CELL_SIZE, item.gridWidth, item.gridHeight);
    const blocked = findBlocker(buildOccupancy(this.items), col, row, item.gridWidth, item.gridHeight, instanceId);
    if (blocked) return 'blocked' as const;

    item.moveTo(col, row);
    this.items = [...this.items];
    await this.save();
    return { col, row };
  }

  /** DraggableObject.onEnd past DELETE_THRESHOLD + handleDelete. */
  async remove(instanceId: string) {
    this.items = this.items.filter(i => i.instanceId !== instanceId);
    await this.save();
  }

  /** handleWaterDragEnd + handleWater. */
  async waterAt(col: number, row: number) {
    const { x, y } = this.touchAt(col, row);
    const cell = this.cellUnder(x, y, { kind: 'can' });
    if (!cell) return false;

    const target = findObjectAtCell(this.items, cell.col, cell.row);
    if (!(target instanceof PlantObject) || !target.water(this.now)) return false;

    this.items = [...this.items];
    await this.save();
    return true;
  }

  /** The growth tick: advance every plant, save only if a stage changed. */
  async tick() {
    let changed = false;
    for (const item of this.items) {
      if (!(item instanceof PlantObject)) continue;
      const before = item.growthStage;
      item.advanceGrowth(this.now);
      if (item.growthStage !== before) changed = true;
    }
    if (changed) await this.save();
    return changed;
  }

  private async save() {
    await saveGardenLayout(this.gardenId, this.items, this.terrain);
  }

  /** A comparable snapshot of the layout. */
  layout() {
    return {
      items: this.items.map(i => i.toData()).sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
      terrain: this.terrain,
    };
  }
}
