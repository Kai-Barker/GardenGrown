import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { CELL_SIZE, parseCellKey } from './constants';
import { TERRAIN } from './terrain';
import type { TerrainMap } from './types';

type TerrainLayerProps = {
  terrain: TerrainMap;
};

/**
 * Paints the terrain map beneath everything else on the grid.
 *
 * This must stay the FIRST child of the grid view and must not set zIndex
 * anywhere in its subtree: placed objects carry `zIndex: row`, and a row-0
 * object resolves to `zIndex: 0`, so it only paints above terrain by virtue of
 * being a later sibling. Giving this layer any zIndex would break that.
 *
 * Tiles fill their cell exactly — no oversize, no bottom-anchoring, unlike the
 * objects that sit on top of them.
 */
function TerrainLayer({ terrain }: TerrainLayerProps) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {Object.entries(terrain).map(([key, terrainId]) => {
        const tile = TERRAIN[terrainId];
        if (!tile) return null;

        const { col, row } = parseCellKey(key);

        return (
          <Image
            key={key}
            source={tile.image}
            style={{
              position: 'absolute',
              left: col * CELL_SIZE,
              top: row * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        );
      })}
    </View>
  );
}

export default React.memo(TerrainLayer);
