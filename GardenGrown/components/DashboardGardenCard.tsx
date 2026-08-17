import React from 'react';
import { View, Text, Image, ImageSourcePropType, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { INVENTORY_ITEMS } from './GardenInventory';

type PlacedItem = {
  catalogId?: string | number;
  instanceId?: string;
  row?: number;
  col?: number;
  x?: number;
  y?: number;
  [key: string]: any;
};

type GardenCardProps = {
  title?: string;
  gardenName?: string;
  placedItems?: PlacedItem[];
  imageSource?: ImageSourcePropType;
  onPressEnter?: () => void;
  totalCards?: number;
  currentIndex?: number;
};

// -------------------------------------------------------------
// TINKER PARAMETERS
// -------------------------------------------------------------
// Total dimensions of your actual garden board (8 columns x 12 rows)
// NOTE: these were previously 4 x 8, which didn't match COLUMNS/ROWS
// in garden.tsx (8 x 12) and threw off the auto-center clamping.
const FULL_GRID_COLS = 8;
const FULL_GRID_ROWS = 12;

// Zoom window dimensions (Lower numbers = closer zoom)
const VIEWPORT_COLS = 5;
const VIEWPORT_ROWS = 5;

// Auto-focus camera on the item cluster center
const AUTO_CENTER_CLUSTER = true;

// Manual fallback offset if AUTO_CENTER_CLUSTER is false
const MANUAL_START_COL = 1.5;
const MANUAL_START_ROW = 3.5;

// How much larger items render vs their logical grid footprint, matching the
// oversize/bottom-anchor rendering used by DraggablePlant on the main garden
// screen (garden.tsx), so the preview matches what the real garden looks like.
const VISUAL_OVERSIZE = 1.5;

// Darkness of the scrim placed over the preview art so title/footer text
// stays legible. Raise for a darker background, lower for lighter.
const DARKEN_OPACITY_CLASS = 'bg-black/40';
// -------------------------------------------------------------

export default function GardenCard({
  title = "Current Garden",
  gardenName = "Raked Sand",
  placedItems = [],
  imageSource,
  onPressEnter,
  totalCards = 3,
  currentIndex = 0,
}: GardenCardProps) {

  let startCol = MANUAL_START_COL;
  let startRow = MANUAL_START_ROW;

  if (AUTO_CENTER_CLUSTER && placedItems.length > 0) {
    let sumCenterX = 0;
    let sumCenterY = 0;

    placedItems.forEach((item) => {
      const rawCol = item.col ?? item.x ?? 1;
      const rawRow = item.row ?? item.y ?? 1;
      const colIdx = rawCol > 0 ? rawCol - 1 : rawCol;
      const rowIdx = rawRow > 0 ? rawRow - 1 : rawRow;

      const invItem = INVENTORY_ITEMS.find(
        (i) => i.id === String(item.catalogId)
      );

      const spanCols = item.gridWidth ?? invItem?.gridWidth ?? 1;
      const spanRows = item.gridHeight ?? invItem?.gridHeight ?? 1;

      // Add the true center point of the item (origin + half width/height)
      sumCenterX += colIdx + spanCols / 2;
      sumCenterY += rowIdx + spanRows / 2;
    });

    const avgCenterX = sumCenterX / placedItems.length;
    const avgCenterY = sumCenterY / placedItems.length;

    // Position viewport top-left so (avgCenterX, avgCenterY) sits at the camera center
    startCol = avgCenterX - VIEWPORT_COLS / 2;
    startRow = avgCenterY - VIEWPORT_ROWS / 2;

    // Safe boundary clamping to prevent camera overflow
    const maxStartCol = Math.max(0, FULL_GRID_COLS - VIEWPORT_COLS);
    const maxStartRow = Math.max(0, FULL_GRID_ROWS - VIEWPORT_ROWS);

    startCol = Math.max(0, Math.min(maxStartCol, startCol));
    startRow = Math.max(0, Math.min(maxStartRow, startRow));
  }

  // Sort items by row so background items render behind foreground items
  const sortedItems = [...placedItems].sort((a, b) => {
    const rowA = a.row ?? a.y ?? 0;
    const rowB = b.row ?? b.y ?? 0;
    return rowA - rowB;
  });

  return (
    <View className="relative w-full h-full">
      {/* Drop Shadow */}
      <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />

      {/* Main Card Content — overflow-hidden clips the full-bleed preview to the rounded corners */}
      <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl h-full w-full overflow-hidden">

        {/* FULL-BLEED TRANSPARENT PREVIEW — absolutely positioned behind everything else,
            fills the entire card, and has no opaque background of its own so the card's
            own bg-[#545E75] (or your imageSource) always shows through. */}
        <View className="absolute inset-0" pointerEvents="none">
          {imageSource ? (
            <Image
              source={imageSource}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : placedItems.length > 0 ? (
            <View className="relative w-full h-full">

              {/* Scaled Grid Lines — tinted light since they now sit over the dark card bg */}
              <View className="absolute inset-0 flex-col justify-between">
                {Array.from({ length: Math.ceil(VIEWPORT_ROWS) }).map((_, rIdx) => (
                  <View
                    key={`row-${rIdx}`}
                    className="w-full flex-1 border-b border-white/10"
                  />
                ))}
              </View>
              <View className="absolute inset-0 flex-row justify-between">
                {Array.from({ length: Math.ceil(VIEWPORT_COLS) }).map((_, cIdx) => (
                  <View
                    key={`col-${cIdx}`}
                    className="h-full flex-1 border-r border-white/10"
                  />
                ))}
              </View>

              {/* Placed Items Positioned Relative to Viewport Camera */}
              {sortedItems.map((item, idx) => {
                const rawCol = item.col ?? item.x ?? 1;
                const rawRow = item.row ?? item.y ?? 1;

                const colIdx = rawCol > 0 ? rawCol - 1 : rawCol;
                const rowIdx = rawRow > 0 ? rawRow - 1 : rawRow;

                const invItem = INVENTORY_ITEMS.find(
                  (i) => i.id === String(item.catalogId)
                );

                // Prefer span/isTall stored on the placed item itself (garden.tsx saves
                // these directly), falling back to the catalog entry.
                const spanCols = item.gridWidth ?? invItem?.gridWidth ?? 1;
                const spanRows = item.gridHeight ?? invItem?.gridHeight ?? 1;
                const isTallItem = item.isTall ?? invItem?.isTall ?? false;

                // Logical footprint: the grid cell(s) this item actually occupies.
                const logicalLeftPercent = ((colIdx - startCol) / VIEWPORT_COLS) * 100;
                const logicalTopPercent = ((rowIdx - startRow) / VIEWPORT_ROWS) * 100;
                const logicalWidthPercent = (spanCols / VIEWPORT_COLS) * 100;
                const logicalHeightPercent = (spanRows / VIEWPORT_ROWS) * 100;

                // Visual render size — same oversize rule as DraggablePlant in garden.tsx:
                // large (2-tall) items render in a 2x2 visual box; tall-but-not-large items
                // get an extra height boost; everything gets scaled up by VISUAL_OVERSIZE.
                const isLarge = spanRows >= 2;
                const renderCols = isLarge ? 2 : spanCols;
                const renderRows = isLarge ? 2 : spanRows;

                const visualWidthCells = renderCols * VISUAL_OVERSIZE;
                const visualHeightCells = isTallItem && !isLarge ? 2 : renderRows * VISUAL_OVERSIZE;

                const visualWidthPercent = (visualWidthCells / VIEWPORT_COLS) * 100;
                const visualHeightPercent = (visualHeightCells / VIEWPORT_ROWS) * 100;

                // Center the oversized visual box horizontally on the logical footprint,
                // and bottom-anchor it (feet stay planted in the right cell) — matching
                // how garden.tsx positions the oversized image within its logical box.
                const visualLeftPercent = logicalLeftPercent + (logicalWidthPercent - visualWidthPercent) / 2;
                const visualTopPercent = (logicalTopPercent + logicalHeightPercent) - visualHeightPercent;

                return (
                  <View
                    key={item.instanceId || `item-${idx}`}
                    style={{
                      position: 'absolute',
                      left: `${visualLeftPercent}%`,
                      top: `${visualTopPercent}%`,
                      width: `${visualWidthPercent}%`,
                      height: `${visualHeightPercent}%`,
                    }}
                    className="items-center justify-center"
                  >
                    {invItem?.image ? (
                      <Image
                        source={invItem.image}
                        className="w-full h-full"
                        resizeMode="contain"
                      />
                    ) : (
                      <View className="w-2 h-2 rounded-full bg-white/30" />
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="items-center justify-center w-full h-full">
              <MaterialCommunityIcons name="image-filter-vintage" size={22} color="#A3C4A3" />
              <Text className="font-zenloop text-[#A3C4A3]/60 text-2xl -mt-1">
                Empty Garden
              </Text>
            </View>
          )}

          {/* Darken scrim — sits above the art but below the text layer below,
              so title/footer stay legible over busy or light preview content.
              Tweak DARKEN_OPACITY_CLASS above to adjust strength. */}
          <View className={`absolute inset-0 ${DARKEN_OPACITY_CLASS}`} />
        </View>

        {/* FOREGROUND CONTENT — sits on top of the preview layer. pointerEvents="box-none"
            lets touches pass through the empty middle straight to the card's own Pressable
            (e.g. the one wrapping <GardenCard /> in dashboard.tsx), while the Enter Garden
            Pressable below still receives its own taps normally. */}
        <View
          className="relative flex-1 p-3 flex-col justify-between h-full w-full"
          pointerEvents="box-none"
        >
          {/* Title Section */}
          <View>
            <Text
              className="font-zenmaru text-[#FADBB3] text-2xl leading-tight"
              style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}
            >
              {title}
            </Text>
            <Text
              className="font-zenloop text-gray-200 text-3xl -mt-1"
              style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}
            >
              {gardenName}
            </Text>
          </View>

          {/* Footer Navigation */}
          <View className="items-center">
            <Pressable onPress={onPressEnter} className="active:opacity-75">
              <Text
                className="font-zenloop text-[#A3C4A3] text-4xl leading-none mb-1.5"
                style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}
              >
                -- Enter Garden --
              </Text>
            </Pressable>

            <View className="flex-row justify-center items-center gap-1.5">
              {Array.from({ length: totalCards }).map((_, idx) => (
                <View
                  key={idx}
                  className={`w-2 h-2 rounded-full ${
                    idx === currentIndex
                      ? 'bg-[#A3C4A3]'
                      : 'border border-[#A3C4A3]'
                  }`}
                />
              ))}
            </View>
          </View>
        </View>

      </View>
    </View>
  );
}
