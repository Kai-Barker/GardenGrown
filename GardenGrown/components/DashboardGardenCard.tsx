import React from 'react';
import { View, Text, ImageSourcePropType, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getEntry } from './Garden/catalog';
import { PlacedObject, PlantObject } from './Garden/objects';
import { COLUMNS as FULL_GRID_COLS, ROWS as FULL_GRID_ROWS, computeVisualBox, parseCellKey } from './Garden/constants';
import { TERRAIN } from './Garden/terrain';
import type { TerrainMap } from './Garden/types';

// Mirrors PlacedObjectData, loosened because this reads straight off a Firestore
// doc. Coordinates are 0-based, matching the garden and the terrain map.
type PlacedItem = {
  catalogId?: string | number;
  instanceId?: string;
  row?: number;
  col?: number;
  [key: string]: any;
};

type GardenCardProps = {
  title?: string;
  gardenName?: string;
  placedItems?: PlacedItem[];
  terrain?: TerrainMap;
  imageSource?: ImageSourcePropType;
  onPressEnter?: () => void;
  /** Footer call-to-action. Overridden for the no-gardens empty state. */
  enterLabel?: string;
  totalCards?: number;
  currentIndex?: number;
};

// -------------------------------------------------------------
// TINKER PARAMETERS
// -------------------------------------------------------------
// Grid dimensions and the oversize rule are imported from Garden/constants so
// they can't drift from the real garden board. They have drifted twice before
// (4x8 vs 8x12, then 12 vs 16 rows), each time throwing off the camera
// clamping below — don't re-declare them locally.

// Zoom window dimensions (Lower numbers = closer zoom)
const VIEWPORT_COLS = 5;
const VIEWPORT_ROWS = 5;

// Auto-focus camera on the item cluster center
const AUTO_CENTER_CLUSTER = true;

// Manual fallback offset if AUTO_CENTER_CLUSTER is false
const MANUAL_START_COL = 1.5;
const MANUAL_START_ROW = 3.5;

// Darkness of the scrim placed over the preview art so title/footer text
// stays legible. Raise for a darker background, lower for lighter.
const DARKEN_OPACITY_CLASS = 'bg-black/40';
// -------------------------------------------------------------

export default function GardenCard({
  title = "Current Garden",
  gardenName = "Raked Sand",
  placedItems = [],
  terrain,
  imageSource,
  onPressEnter,
  enterLabel = "Enter Garden",
  totalCards = 3,
  currentIndex = 0,
}: GardenCardProps) {
  const terrainEntries = terrain ? Object.entries(terrain) : [];
  const hasContent = placedItems.length > 0 || terrainEntries.length > 0;

  let startCol = MANUAL_START_COL;
  let startRow = MANUAL_START_ROW;

  if (AUTO_CENTER_CLUSTER && placedItems.length > 0) {
    let sumCenterX = 0;
    let sumCenterY = 0;

    placedItems.forEach((item) => {
      const col = item.col ?? 0;
      const row = item.row ?? 0;

      const invItem = getEntry(String(item.catalogId));

      const spanCols = item.gridWidth ?? invItem?.gridWidth ?? 1;
      const spanRows = item.gridHeight ?? invItem?.gridHeight ?? 1;

      // Add the true center point of the item (origin + half width/height)
      sumCenterX += col + spanCols / 2;
      sumCenterY += row + spanRows / 2;
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
    const rowA = a.row ?? 0;
    const rowB = b.row ?? 0;
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
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : hasContent ? (
            <View className="relative w-full h-full">

              {/* Terrain — drawn first so it sits under the items, matching the
                  real garden's layering. */}
              {terrainEntries.map(([key, terrainId]) => {
                const tile = TERRAIN[terrainId];
                if (!tile) return null;

                const { col, row } = parseCellKey(key);

                return (
                  <Image
                    key={`terrain-${key}`}
                    source={tile.image}
                    style={{
                      position: 'absolute',
                      left: `${((col - startCol) / VIEWPORT_COLS) * 100}%`,
                      top: `${((row - startRow) / VIEWPORT_ROWS) * 100}%`,
                      width: `${(1 / VIEWPORT_COLS) * 100}%`,
                      height: `${(1 / VIEWPORT_ROWS) * 100}%`,
                    }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                );
              })}

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
                // Coordinates are 0-based and shared with terrain — no offset.
                const colIdx = item.col ?? 0;
                const rowIdx = item.row ?? 0;

                const invItem = getEntry(String(item.catalogId));

                // Resolve art through the same object model the garden uses, so a
                // seedling shows as a seedling here too rather than full-grown.
                // Falls back to the catalog image if the item can't be hydrated.
                const placed = invItem
                  ? PlacedObject.fromData(
                      { ...(item as any), catalogId: String(item.catalogId) },
                      invItem,
                    )
                  : null;
                const itemImage = placed ? placed.getImage() : invItem?.image;
                const stageCells =
                  placed instanceof PlantObject ? placed.getVisualCells() : undefined;

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

                // Same oversize/bottom-anchor rule the real garden uses, in cell
                // units, scaled here into viewport percentages.
                const box = computeVisualBox({
                  gridWidth: spanCols,
                  gridHeight: spanRows,
                  isTall: isTallItem,
                  visualCells: stageCells,
                });

                const visualWidthPercent = (box.width / VIEWPORT_COLS) * 100;
                const visualHeightPercent = (box.height / VIEWPORT_ROWS) * 100;

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
                    {itemImage ? (
                      <Image
                        source={itemImage}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
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
                -- {enterLabel} --
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
