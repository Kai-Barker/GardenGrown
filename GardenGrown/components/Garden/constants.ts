import { Dimensions } from 'react-native';

/**
 * Single source of truth for garden grid geometry.
 *
 * These used to be copy-pasted between garden.tsx and DashboardGardenCard.tsx,
 * and they drifted twice (4x8 vs 8x12, then 12 vs 16 rows) — each time silently
 * throwing off the dashboard preview's camera clamping. Import from here.
 */

export const COLUMNS = 8;
export const ROWS = 16;
export const TOTAL_CELLS = COLUMNS * ROWS;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const GRID_WIDTH = screenWidth - 48;
const INNER_GRID_WIDTH = GRID_WIDTH - 4;
export const CELL_SIZE = INNER_GRID_WIDTH / COLUMNS;
export const GRID_HEIGHT = CELL_SIZE * ROWS + 4;

/** Drag an item below this screen Y to delete it. */
export const DELETE_THRESHOLD = screenHeight - 150;

/** How much larger art renders than the footprint it logically occupies. */
export const VISUAL_OVERSIZE = 1.5;

/** Key for the occupancy and terrain maps. */
export const cellKey = (col: number, row: number) => `${col},${row}`;

/** Parses a cellKey back into coordinates. */
export const parseCellKey = (key: string) => {
  const [col, row] = key.split(',').map(Number);
  return { col, row };
};

type VisualBoxInput = {
  gridWidth: number;
  gridHeight: number;
  isTall?: boolean;
  /**
   * Overrides the computed size with a fixed square this many cells across.
   * Growth stages use it so a seed stays seed-sized regardless of whether it
   * grows into a tulip or an oak.
   */
  visualCells?: number;
};

/**
 * The oversize/bottom-anchor rule, in cell units rather than pixels so callers
 * can scale into either pixels (the garden) or percentages (the dashboard).
 *
 * Art is drawn larger than its logical footprint and anchored to the bottom of
 * it, so a plant's feet stay planted in the cell it occupies while its foliage
 * spills over the neighbours. `left` is negative — the offset that horizontally
 * centres the oversized box on the footprint.
 */
export const computeVisualBox = ({ gridWidth, gridHeight, isTall, visualCells }: VisualBoxInput) => {
  // A fixed-size stage ignores the footprint entirely and renders as a square,
  // still bottom-anchored and centred so it sits in the cell it was planted in.
  if (visualCells !== undefined) {
    return {
      width: visualCells,
      height: visualCells,
      left: -(visualCells - gridWidth) / 2,
    };
  }

  const isLarge = gridHeight >= 2;
  const renderCols = isLarge ? 2 : gridWidth;
  const renderRows = isLarge ? 2 : gridHeight;

  const width = renderCols * VISUAL_OVERSIZE;
  const height = isTall && !isLarge ? 2 : renderRows * VISUAL_OVERSIZE;

  return {
    width,
    height,
    /** horizontal offset from the footprint's left edge, in cells */
    left: -(width - gridWidth) / 2,
  };
};
