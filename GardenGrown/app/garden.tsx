import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions, Vibration, ActivityIndicator, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  type SharedValue
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GardenInventory } from '../components/GardenInventory';
import {
  CELL_SIZE,
  COLUMNS,
  DELETE_THRESHOLD,
  GRID_HEIGHT,
  GRID_WIDTH,
  ROWS,
  TOTAL_CELLS,
  cellKey,
  computeVisualBox,
} from '../components/Garden/constants';
import { PlacedObject, PlantObject, DecorationObject } from '../components/Garden/objects';
import { getEntry } from '../components/Garden/catalog';
import { GROWTH_TICK_MS } from '../components/Garden/growth';
import { terrainIdFromCatalogId } from '../components/Garden/terrain';
import TerrainLayer from '../components/Garden/TerrainLayer';
import type { CatalogEntry, PlacedObjectData, TerrainMap } from '../components/Garden/types';
import { auth } from '../firebase';
import {
  getUserGardens,
  getGarden,
  createGarden,
  saveGardenLayout,
  deleteGarden,
} from '../services/garden';

/* DRAGGABLE OBJECT COMPONENT
=================================================== */
type DraggableObjectProps = {
  item: PlacedObject;
  onSnap: (id: string, col: number, row: number) => void;
  onDelete: (id: string) => void;
  onWater: (id: string) => void;
  setScrollEnabled: (enabled: boolean) => void;
  occupiedCells: Record<string, string>;
  zoomScale: SharedValue<number>;
};

function DraggableObject({ item, onSnap, onDelete, onWater, setScrollEnabled, occupiedCells, zoomScale }: DraggableObjectProps) {
  const translateX = useSharedValue(item.col * CELL_SIZE);
  const translateY = useSharedValue(item.row * CELL_SIZE);
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Read everything the gesture worklets need off the instance up front —
  // worklets can only close over plain values, not class instances.
  const { instanceId, col, row, gridWidth: itemWidth, gridHeight: itemHeight } = item;

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      width: CELL_SIZE * itemWidth,
      height: CELL_SIZE * itemHeight,
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
      zIndex: interpolate(isDragging.value ? 1 : 0, [0, 1], [row, 999]),
    };
  });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      runOnJS(setScrollEnabled)(false); 
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const currentScale = (zoomScale && zoomScale.value > 0) ? zoomScale.value : 1;
      translateX.value = startX.value + (event.translationX / currentScale);
      translateY.value = startY.value + (event.translationY / currentScale);
    })
    .onEnd((event) => {
      isDragging.value = false;
      runOnJS(setScrollEnabled)(true); 

      if (event.absoluteY > DELETE_THRESHOLD) {
        runOnJS(Vibration.vibrate)([0, 50, 100, 50]);
        runOnJS(onDelete)(instanceId);
        return;
      }

      const currentX = translateX.value;
      const currentY = translateY.value;

      let newCol = Math.round(currentX / CELL_SIZE);
      let newRow = Math.round(currentY / CELL_SIZE);
      newCol = Math.max(0, Math.min(newCol, COLUMNS - itemWidth));
      newRow = Math.max(0, Math.min(newRow, ROWS - itemHeight));

      let isBlocked = false;
      for (let c = 0; c < itemWidth; c++) {
        for (let r = 0; r < itemHeight; r++) {
          const key = `${newCol + c},${newRow + r}`;
          const blockingItem = occupiedCells[key];
          if (blockingItem && blockingItem !== instanceId) {
            isBlocked = true;
          }
        }
      }

      if (isBlocked) {
        runOnJS(Vibration.vibrate)([0, 50, 50, 50]);
        translateX.value = withSpring(col * CELL_SIZE);
        translateY.value = withSpring(row * CELL_SIZE);
      } else {
        translateX.value = withSpring(newCol * CELL_SIZE);
        translateY.value = withSpring(newRow * CELL_SIZE);
        runOnJS(onSnap)(instanceId, newCol, newRow);
      }
    });

  // Tapping a plant waters it. Raced against the pan so a drag never also
  // registers as a tap; only plants respond, so decorations behave as before.
  const isPlant = item.kind === 'plant';
  const tapGesture = Gesture.Tap()
    .enabled(isPlant)
    .onEnd((_event, success) => {
      if (success) runOnJS(onWater)(instanceId);
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  // Art renders larger than its footprint and bottom-anchored to it, so a
  // plant's feet stay in its cell while foliage spills over the neighbours.
  // An early growth stage overrides the size so a seed stays seed-sized.
  const box = computeVisualBox({
    gridWidth: item.gridWidth,
    gridHeight: item.gridHeight,
    isTall: item.isTall,
    visualCells: item instanceof PlantObject ? item.getVisualCells() : undefined,
  });
  const visualWidth = CELL_SIZE * box.width;
  const visualHeight = CELL_SIZE * box.height;
  const leftOffset = CELL_SIZE * box.left;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: leftOffset,
          width: visualWidth,
          height: visualHeight,
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}>
          <Image
            source={item.getImage()}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            // Growth swaps this source out; a short crossfade turns the stage
            // change into a transition instead of a pop.
            transition={200}
            cachePolicy="memory-disk"
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/* MAIN GARDEN SCREEN
=================================================== */
export default function GardenScreen() {
  const router = useRouter();
  const { gardenId } = useLocalSearchParams<{ gardenId: string }>();

  const [loading, setLoading] = useState(true);
  const [currentGardenDocId, setCurrentGardenDocId] = useState<string | null>(gardenId || null);
  const [currentGardenName, setCurrentGardenName] = useState('Loading...');
  
  // DROPDOWN STATE
  const [userGardens, setUserGardens] = useState<{ id: string; name: string }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isScrollEnabled, setIsScrollEnabled] = useState(true);
  const [activeGhost, setActiveGhost] = useState<CatalogEntry | null>(null);
  const [placedItems, setPlacedItems] = useState<PlacedObject[]>([]);
  const [terrain, setTerrain] = useState<TerrainMap>({});

  // Mirrors of the two layout states, so a save triggered from inside one
  // setState updater can read the other half without closing over stale state.
  const placedItemsRef = useRef<PlacedObject[]>([]);
  const terrainRef = useRef<TerrainMap>({});

  useEffect(() => { placedItemsRef.current = placedItems; }, [placedItems]);
  useEffect(() => { terrainRef.current = terrain; }, [terrain]);

  const gridRef = useRef<View>(null);
  const zoomScaleRef = useRef(1);
  const activeDragX = useSharedValue(0);
  const activeDragY = useSharedValue(0);
  const zoomScale = useSharedValue(1);

  // --- GHOST VISUAL SIZING & ANIMATED STYLE ---
  // Terrain tiles fill exactly one cell; everything else previews at the same
  // oversized scale it'll render at once placed.
  const isGhostTerrain = activeGhost?.kind === 'terrain';
  const ghostBox = isGhostTerrain
    ? { width: 1, height: 1 }
    : computeVisualBox({
        gridWidth: activeGhost?.gridWidth ?? 1,
        gridHeight: activeGhost?.gridHeight ?? 1,
        isTall: activeGhost?.isTall,
      });

  const ghostVisualWidth = CELL_SIZE * ghostBox.width;
  const ghostVisualHeight = CELL_SIZE * ghostBox.height;

  const ghostAnimatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    transform: [
      { translateX: activeDragX.value - (ghostVisualWidth / 2) }, 
      { translateY: activeDragY.value - (ghostVisualHeight * 0.75) } 
    ],
    zIndex: 9999,
    pointerEvents: 'none',
  }));

  // --- 1. FETCH ALL USER GARDENS FOR DROPDOWN ---
  const fetchUserGardens = async () => {
    if (!auth.currentUser) return;
    try {
      const userGardens = await getUserGardens(auth.currentUser.uid);

      const fetchedList = userGardens.map((garden) => ({
        id: garden.id,
        name: garden.GardenTheme || 'Untitled Garden',
      }));

      setUserGardens(fetchedList);

      // Default to first garden if none selected
      if (!currentGardenDocId && fetchedList.length > 0) {
        setCurrentGardenDocId(fetchedList[0].id);
      }
    } catch (error) {
      console.error("Error fetching user gardens:", error);
    }
  };

  useEffect(() => {
    fetchUserGardens();
  }, [currentGardenDocId]);

  // --- 2. FETCH CURRENT SELECTED GARDEN DATA ---
  useEffect(() => {
    const fetchGarden = async () => {
      if (!currentGardenDocId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const data = await getGarden(currentGardenDocId);

        if (data) {
          setCurrentGardenName(data.GardenTheme || 'My Garden');

          if (data.PlacedItems && Array.isArray(data.PlacedItems)) {
            // Objects whose catalogId no longer exists resolve to null and are
            // dropped, matching the long-standing behaviour here.
            const reconstructedItems = (data.PlacedItems as PlacedObjectData[])
              .map((savedItem) => PlacedObject.fromData(savedItem, getEntry(savedItem.catalogId)))
              .filter((item): item is PlacedObject => item !== null);

            // Growth accrues while the app is closed, so catch every plant up to
            // real elapsed time before the first render. Stage is derived from
            // plantedAt, so this needs no write — it recomputes on every load.
            reconstructedItems.forEach((item) => {
              if (item instanceof PlantObject) item.advanceGrowth();
            });

            setPlacedItems(reconstructedItems);
            placedItemsRef.current = reconstructedItems;
          } else {
            setPlacedItems([]);
            placedItemsRef.current = [];
          }

          // Gardens created before terrain existed have no Terrain field.
          const loadedTerrain: TerrainMap = data.Terrain ?? {};
          setTerrain(loadedTerrain);
          // Seed the mirrors immediately rather than waiting for the sync
          // effect, so a save fired right after a garden switch can't write
          // the previous garden's half of the layout into this one.
          terrainRef.current = loadedTerrain;
        }
      } catch (error) {
        console.error("Error fetching garden:", error);
        Alert.alert("Error", "Could not load your garden.");
      } finally {
        setLoading(false);
      }
    };

    fetchGarden();
  }, [currentGardenDocId]);

  // --- 3. SAVE GARDEN DATA ---
  // Objects and terrain are saved together. Callers pass whichever half they
  // just changed; the other half comes from the ref, which always holds the
  // latest committed value (plain state would be stale inside a setState
  // updater, where most of these calls happen).
  const saveGardenData = async (objects?: PlacedObject[], terrainMap?: TerrainMap) => {
    if (!currentGardenDocId) return;

    const nextObjects = objects ?? placedItemsRef.current;
    const nextTerrain = terrainMap ?? terrainRef.current;

    placedItemsRef.current = nextObjects;
    terrainRef.current = nextTerrain;

    try {
      await saveGardenLayout(currentGardenDocId, nextObjects, nextTerrain);
    } catch (error) {
      console.error("Error saving garden:", error);
    }
  };

  // --- 4. CREATE NEW GARDEN ---
  const handleCreateNewGarden = () => {
    Alert.prompt(
      "New Garden",
      "Give your new garden a name:",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Create", 
          onPress: async (name?: string) => {
            if (!name || !auth.currentUser) return;
            try {
              setLoading(true);
              const newGardenId = await createGarden(auth.currentUser.uid, name);

              setCurrentGardenDocId(newGardenId);
              setCurrentGardenName(name);
              setPlacedItems([]);
              placedItemsRef.current = [];
              // Clear terrain too, or the previous garden's tiles would be
              // rendered over — and then saved into — the new empty garden.
              setTerrain({});
              terrainRef.current = {};
            } catch (error) {
              console.error("Error creating garden:", error);
              Alert.alert("Error", "Could not create garden.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleSelectGarden = (id: string) => {
    setCurrentGardenDocId(id);
    setIsDropdownOpen(false);
  };

  const handleDeleteGarden = (id: string, name: string) => {
    Alert.alert(
      `Delete "${name}"?`,
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteGarden(id);
              const remaining = userGardens.filter(g => g.id !== id);
              setUserGardens(remaining);

              if (id === currentGardenDocId) {
                if (remaining.length > 0) {
                  setCurrentGardenDocId(remaining[0].id);
                } else {
                  setIsDropdownOpen(false);
                  router.replace('/(tabs)/dashboard');
                }
              }
            } catch (error) {
              console.error("Error deleting garden:", error);
              Alert.alert("Error", "Could not delete garden.");
            }
          }
        }
      ]
    );
  };

  const handleScroll = (e: any) => {
    const currentScale = e?.nativeEvent?.zoomScale;
    if (currentScale && currentScale > 0) {
      zoomScale.value = currentScale;
      zoomScaleRef.current = currentScale;
    }
  };

  // "col,row" -> instanceId, for collision checks. Objects that don't block
  // (terrain) are skipped, so a plant can be placed on a painted cell.
  const occupiedCells = useMemo(() => {
    const map: Record<string, string> = {};
    placedItems.forEach(item => {
      if (!item.blocksPlacement) return;
      item.occupiedCells().forEach(key => {
        map[key] = item.instanceId;
      });
    });
    return map;
  }, [placedItems]);

  const handleSnap = (id: string, newCol: number, newRow: number) => {
    setPlacedItems(prev => {
      const updated = prev.map(item =>
        item.instanceId === id ? item.moveTo(newCol, newRow) : item
      );
      saveGardenData(updated);
      return updated;
    });
  };

  const handleDelete = (id: string) => {
    setPlacedItems(prev => {
      const updated = prev.filter(item => item.instanceId !== id);
      saveGardenData(updated);
      return updated;
    });
  };

  /** Records a watering. Growth is time-based for now, so this only logs when. */
  const handleWater = (id: string) => {
    setPlacedItems(prev => {
      const target = prev.find(item => item.instanceId === id);
      if (!(target instanceof PlantObject)) return prev;

      Vibration.vibrate(30);
      target.water();

      // water() mutates in place; the new array is what re-renders.
      const updated = [...prev];
      saveGardenData(updated);
      return updated;
    });
  };

  // Plants keep growing while the garden is open. Each tick advances every plant
  // in memory and only commits when a stage actually changed — an uncommitted
  // tick costs nothing, since stage is recomputed from plantedAt on next load.
  useEffect(() => {
    if (!currentGardenDocId) return;

    const interval = setInterval(() => {
      setPlacedItems(prev => {
        let changed = false;

        prev.forEach(item => {
          if (!(item instanceof PlantObject)) return;

          const before = item.growthStage;
          item.advanceGrowth();
          if (item.growthStage !== before) changed = true;
        });

        // Objects mutate in place, so a fresh array is what actually tells React
        // to re-render — same pattern as handleSnap.
        if (!changed) return prev;

        const updated = [...prev];
        saveGardenData(updated);
        return updated;
      });
    }, GROWTH_TICK_MS);

    return () => clearInterval(interval);
  }, [currentGardenDocId]);

  /** Paints (or, for the eraser, clears) a single terrain cell. */
  const handlePaintTerrain = (catalogId: string, col: number, row: number) => {
    setTerrain(prev => {
      const key = cellKey(col, row);
      const terrainId = terrainIdFromCatalogId(catalogId);

      const updated = { ...prev };
      if (terrainId === null) {
        delete updated[key];
      } else {
        updated[key] = terrainId;
      }

      saveGardenData(undefined, updated);
      return updated;
    });
  };

  const handleInventoryDragStart = (entry: CatalogEntry) => {
    setActiveGhost(entry);
  };

  const handleInventoryDragEnd = (absoluteX: number, absoluteY: number) => {
    const entry = activeGhost;
    if (!entry) return;

    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (!width || !height) return;

      if (
        absoluteX >= pageX && absoluteX <= pageX + width &&
        absoluteY >= pageY && absoluteY <= pageY + height
      ) {
        const currentZoom = zoomScaleRef.current || 1;
        const scaledCellSize = CELL_SIZE * currentZoom;

        const relativeX = absoluteX - pageX;
        const relativeY = absoluteY - pageY;

        const ghostLogicalWidth = entry.gridWidth ?? 1;
        const ghostLogicalHeight = entry.gridHeight ?? 1;

        let targetCol = Math.floor(relativeX / scaledCellSize);
        let targetRow = Math.floor(relativeY / scaledCellSize);
        targetCol = Math.max(0, Math.min(targetCol, COLUMNS - ghostLogicalWidth));
        targetRow = Math.max(0, Math.min(targetRow, ROWS - ghostLogicalHeight));

        if (entry.kind === 'terrain') {
          // Terrain paints its own layer, so it never collides with what's
          // already on the cell — planting on grass is the whole point.
          handlePaintTerrain(entry.id, targetCol, targetRow);
        } else {
          let isBlocked = false;
          for (let c = 0; c < ghostLogicalWidth; c++) {
            for (let r = 0; r < ghostLogicalHeight; r++) {
              if (occupiedCells[cellKey(targetCol + c, targetRow + r)]) {
                isBlocked = true;
              }
            }
          }

          if (isBlocked) {
            Vibration.vibrate([0, 50, 50, 50]);
          } else {
            setPlacedItems(prev => {
              const instanceId = Date.now().toString();
              const newItem = entry.kind === 'plant'
                ? new PlantObject(instanceId, entry, targetCol, targetRow, {
                    plantedAt: Date.now(),
                    lastWateredAt: Date.now(),
                    growthStage: 0,
                  })
                : new DecorationObject(instanceId, entry, targetCol, targetRow);

              const updated = [...prev, newItem];
              saveGardenData(updated);
              return updated;
            });
          }
        }
      }
      setActiveGhost(null);
    });
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#F4EFE6] items-center justify-center">
        <ActivityIndicator size="large" color="#4A4A4A" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-[#F4EFE6]">
        
        {/* GARDEN DROPDOWN MODAL */}
        <Modal
          visible={isDropdownOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsDropdownOpen(false)}
        >
          <Pressable
            className="flex-1 bg-black/40 justify-start pt-28 items-center"
            onPress={() => setIsDropdownOpen(false)}
          >
            <Pressable
              className="relative w-[85%]"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />
              <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl p-4">
                <Text className="font-zenmaru-bold text-xl text-[#FADBB3] mb-3 border-b border-[#FADBB3]/20 pb-2">
                  Select Garden
                </Text>

                <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                  {userGardens.map((g) => {
                    const isSelected = g.id === currentGardenDocId;
                    return (
                      <Pressable
                        key={g.id}
                        onPress={() => handleSelectGarden(g.id)}
                        className={`flex-row justify-between items-center p-3 rounded-xl mb-2 border-2 ${
                          isSelected ? 'border-[#9BB49E] bg-[#9BB49E]/20' : 'border-[#FADBB3]/15 active:bg-[#FADBB3]/10'
                        }`}
                      >
                        <Text
                          numberOfLines={1}
                          className={`flex-1 font-zenmaru text-lg ${isSelected ? 'text-[#FADBB3] font-bold' : 'text-[#FADBB3]/70'}`}
                        >
                          {g.name}
                        </Text>

                        <View className="flex-row items-center gap-x-3 ml-2">
                          {isSelected && (
                            <MaterialCommunityIcons name="check" size={20} color="#9BB49E" />
                          )}
                          <Pressable
                            hitSlop={8}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDeleteGarden(g.id, g.name);
                            }}
                            className="active:opacity-60"
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#D9534F" />
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View className="border-t border-[#FADBB3]/20 mt-2 pt-3">
                  <Pressable
                    onPress={() => {
                      setIsDropdownOpen(false);
                      handleCreateNewGarden();
                    }}
                    className="relative active:opacity-80"
                  >
                    <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
                    <View className="relative flex-row items-center justify-center gap-x-2 p-3 rounded-xl bg-[#9BB49E] border-2 border-[#4A4A4A]">
                      <MaterialCommunityIcons name="plus" size={22} color="#4A4A4A" />
                      <Text className="font-zenmaru-bold text-lg text-[#4A4A4A]">Create New Garden</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Global Ghost Item Overlay Layer */}
        {activeGhost && (
          <Animated.View style={[ghostAnimatedStyle, {
            width: ghostVisualWidth,
            height: ghostVisualHeight
          }]}>
            {activeGhost.image ? (
              <Image
                source={activeGhost.image}
                style={{ width: '100%', height: '100%', opacity: 0.8 }}
                contentFit={isGhostTerrain ? 'cover' : 'contain'}
                cachePolicy="memory-disk"
              />
            ) : (
              // The eraser has no art of its own.
              <View className="w-full h-full items-center justify-center rounded-md bg-[#4A4A4A]/30 border border-[#4A4A4A]/50">
                <MaterialCommunityIcons name="eraser" size={CELL_SIZE * 0.6} color="#F4EFE6" />
              </View>
            )}
          </Animated.View>
        )}

        <View pointerEvents="none" className="absolute inset-0 z-0">
          <Image
            source={require('../assets/textures/SandTextureVertical.webp')}
            style={{ width: '100%', height: '100%', opacity: 0.3 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>

        <SafeAreaView className="flex-1 justify-between" edges={['top']}>

          <View className="flex-1 z-0 mt-2 mb-2">
            <ScrollView
              scrollEnabled={isScrollEnabled} 
              maximumZoomScale={3} 
              minimumZoomScale={1} 
              bouncesZoom={true} 
              centerContent={true}
              showsHorizontalScrollIndicator={false} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingBottom: 100
              }}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              <View 
                ref={gridRef}
                style={{ width: GRID_WIDTH, height: GRID_HEIGHT }}
                className="bg-[#EFEAE1]/50 border-2 border-[#4A4A4A]/40 rounded-lg shadow-sm relative"
              >
                {/* Terrain must stay the FIRST child and carry no zIndex —
                    objects use `zIndex: row`, so a row-0 object only paints
                    above terrain by being a later sibling. */}
                <TerrainLayer terrain={terrain} />

                <View className="absolute inset-0 flex-row flex-wrap pointer-events-none">
                  {Array.from({ length: TOTAL_CELLS }).map((_, index) => (
                    <View key={`cell-${index}`} style={{ width: `${100 / COLUMNS}%`, height: CELL_SIZE }} className="border border-[#4A4A4A]/10" />
                  ))}
                </View>

                {placedItems.map(item => (
                  <DraggableObject
                    key={item.instanceId}
                    item={item}
                    onSnap={handleSnap}
                    onDelete={handleDelete}
                    onWater={handleWater}
                    setScrollEnabled={setIsScrollEnabled}
                    occupiedCells={occupiedCells}
                    zoomScale={zoomScale}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          <GardenInventory
            dragX={activeDragX}
            dragY={activeDragY}
            onDragStart={handleInventoryDragStart}
            onDragEnd={handleInventoryDragEnd}
            gardenName={currentGardenName}
            isDropdownOpen={isDropdownOpen}
            onBack={() => router.back()}
            onOpenDropdown={() => setIsDropdownOpen(true)}
          />

        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
}