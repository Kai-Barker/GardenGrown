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
import DropHighlight from '../components/Garden/DropHighlight';
import { WATERING_CAN_IMAGE } from '../components/Garden/WateringCan';
import type { CatalogEntry, PlacedObjectData, TerrainMap } from '../components/Garden/types';
import { auth } from '../firebase';
import {
  getUserGardens,
  getGarden,
  createGarden,
  saveGardenLayout,
  deleteGarden,
} from '../services/garden';

/** What's being dragged over the garden right now. */
type Ghost =
  | { kind: 'catalog'; entry: CatalogEntry }
  | { kind: 'can' };

/** Size of the dragged watering can, in grid cells. */
const CAN_GHOST_CELLS = 1.5;

/** Colour of the hint shown over a plant that's waiting to be watered. */
const THIRSTY_COLOR = '#3B82F6';

/** The cell a drag is currently over, and whether dropping there does anything. */
type DropTarget = { col: number; row: number; valid: boolean };

/**
 * Converts a screen touch into a grid cell, given the grid's measured rect and
 * the ScrollView's current zoom.
 *
 * measure() mixes two coordinate conventions inside a zoomed ScrollView, which
 * is what made this subtle:
 *
 *   - pageX/pageY ARE transformed — real screen coords, and strongly negative
 *     at high zoom because the grid's origin is scrolled off-screen.
 *   - width/height are NOT transformed — they stay at the layout size
 *     (measured 342 = GRID_WIDTH at 3x zoom).
 *
 * So the on-screen size has to be reconstructed as width * zoom. Comparing a
 * screen touch against the raw width instead makes the bounds check reject
 * every touch while zoomed, silently refusing all placement.
 */
const screenToCell = (
  absoluteX: number,
  absoluteY: number,
  rect: { pageX: number; pageY: number; width: number; height: number },
  zoom: number,
) => {
  const scale = zoom > 0 ? zoom : 1;

  // The grid's actual on-screen footprint.
  const screenWidth = rect.width * scale;
  const screenHeight = rect.height * scale;
  const cell = CELL_SIZE * scale;

  return {
    col: Math.floor((absoluteX - rect.pageX) / cell),
    row: Math.floor((absoluteY - rect.pageY) / cell),
    inside:
      absoluteX >= rect.pageX && absoluteX <= rect.pageX + screenWidth &&
      absoluteY >= rect.pageY && absoluteY <= rect.pageY + screenHeight,
  };
};

/**
 * "col,row" -> instanceId, for collision checks. Objects that don't block
 * (terrain) are skipped, so a plant can be placed on a painted cell.
 *
 * Module-level so gesture callbacks can rebuild it from a ref instead of
 * closing over the memoised copy, which would be stale by the time they run.
 */
const buildOccupancy = (items: PlacedObject[]): Record<string, string> => {
  const map: Record<string, string> = {};
  items.forEach(item => {
    if (!item.blocksPlacement) return;
    item.occupiedCells().forEach(key => {
      map[key] = item.instanceId;
    });
  });
  return map;
};

/* DRAGGABLE OBJECT COMPONENT
=================================================== */
type DraggableObjectProps = {
  item: PlacedObject;
  onSnap: (id: string, col: number, row: number) => void;
  onDelete: (id: string) => void;
  onMoveStart: (instanceId: string) => void;
  onDragMove: (x: number, y: number) => void;
  onMoveEnd: () => void;
  setScrollEnabled: (enabled: boolean) => void;
  occupiedCells: Record<string, string>;
  zoomScale: SharedValue<number>;
};

function DraggableObject({ item, onSnap, onDelete, onMoveStart, onDragMove, onMoveEnd, setScrollEnabled, occupiedCells, zoomScale }: DraggableObjectProps) {
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
      // Only the id crosses the worklet boundary — runOnJS serialises its
      // arguments, and a PlacedObject instance can't survive that.
      runOnJS(onMoveStart)(instanceId);
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const currentScale = (zoomScale && zoomScale.value > 0) ? zoomScale.value : 1;
      translateX.value = startX.value + (event.translationX / currentScale);
      translateY.value = startY.value + (event.translationY / currentScale);
      runOnJS(onDragMove)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      isDragging.value = false;
      runOnJS(setScrollEnabled)(true);
      runOnJS(onMoveEnd)(); 

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

  // A thirsty plant looks identical to a growing one, so it gets a hint telling
  // the player it's waiting on the watering can.
  const isThirsty = item instanceof PlantObject && item.isThirsty;

  return (
    <GestureDetector gesture={panGesture}>
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

          {isThirsty && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: -CELL_SIZE * 0.30 }}
              className="opacity-80"
            >
              <MaterialCommunityIcons name="water-outline" size={CELL_SIZE * 0.45} color={THIRSTY_COLOR} />
            </View>
          )}
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
  // What's currently being dragged over the garden: either a catalog entry
  // being placed, or the watering can. The can isn't placeable, so it gets its
  // own case rather than a fake catalog entry.
  const [activeGhost, setActiveGhost] = useState<Ghost | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [placedItems, setPlacedItems] = useState<PlacedObject[]>([]);
  const [terrain, setTerrain] = useState<TerrainMap>({});

  // Mirrors of the two layout states, so a save triggered from inside one
  // setState updater can read the other half without closing over stale state.
  const placedItemsRef = useRef<PlacedObject[]>([]);
  const terrainRef = useRef<TerrainMap>({});

  useEffect(() => { placedItemsRef.current = placedItems; }, [placedItems]);
  useEffect(() => { terrainRef.current = terrain; }, [terrain]);

  // What's being dragged, readable from the gesture callbacks without risking a
  // stale closure — those fire via runOnJS and hold the props from the render
  // that built the gesture, which is before any drag began.
  const activeGhostRef = useRef<Ghost | null>(null);

  /** Instance being repositioned, so it doesn't block itself in the highlight. */
  const movingIdRef = useRef<string | null>(null);

  /**
   * Always set the ghost through this, never setActiveGhost directly: the ref
   * has to update synchronously, because a gesture callback may read it in the
   * same tick and an effect wouldn't have run yet.
   */
  const updateGhost = (ghost: Ghost | null) => {
    activeGhostRef.current = ghost;
    setActiveGhost(ghost);
  };

  const gridRef = useRef<View>(null);
  const zoomScaleRef = useRef(1);

  // The grid's page position, cached when a drag starts. measure() is an async
  // native call, so the live drop highlight can't afford one per frame.
  const gridBoundsRef = useRef<{ pageX: number; pageY: number; width: number; height: number } | null>(null);

  const cacheGridBounds = () => {
    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (width && height) gridBoundsRef.current = { pageX, pageY, width, height };
    });
  };
  const activeDragX = useSharedValue(0);
  const activeDragY = useSharedValue(0);
  const zoomScale = useSharedValue(1);

  // --- GHOST VISUAL SIZING & ANIMATED STYLE ---
  // Terrain tiles fill exactly one cell, the can previews at a fixed size, and
  // everything else previews at the oversized scale it'll render at once placed.
  const ghostEntry = activeGhost?.kind === 'catalog' ? activeGhost.entry : null;
  const isGhostTerrain = ghostEntry?.kind === 'terrain';
  const ghostBox = activeGhost?.kind === 'can'
    ? { width: CAN_GHOST_CELLS, height: CAN_GHOST_CELLS }
    : isGhostTerrain
      ? { width: 1, height: 1 }
      : computeVisualBox({
          gridWidth: ghostEntry?.gridWidth ?? 1,
          gridHeight: ghostEntry?.gridHeight ?? 1,
          isTall: ghostEntry?.isTall,
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

  const occupiedCells = useMemo(() => buildOccupancy(placedItems), [placedItems]);

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

  /**
   * Waters the plant with the given id, starting its current stage's clock.
   * Silently does nothing for anything that isn't a thirsty plant.
   */
  const handleWater = (id: string) => {
    setPlacedItems(prev => {
      const target = prev.find(item => item.instanceId === id);
      if (!(target instanceof PlantObject)) return prev;

      // Already growing, or fully grown — a buzz says "not that one" without
      // costing a re-render or a write.
      if (!target.water()) {
        Vibration.vibrate([0, 50, 50, 50]);
        return prev;
      }

      Vibration.vibrate(30);

      // water() mutates in place; the new array is what re-renders.
      const updated = [...prev];
      saveGardenData(updated);
      return updated;
    });
  };

  /**
   * Resolves a watering-can drop to the plant underneath it. Uses the occupancy
   * map so dropping anywhere on a multi-cell plant's footprint counts.
   */
  const handleWaterDragEnd = (absoluteX: number, absoluteY: number) => {
    // Every cleanup happens here, never inside the measure() callback below:
    // that callback doesn't fire if the view can't be measured, and a missed
    // setIsScrollEnabled(true) would leave the garden permanently frozen.
    setDropTarget(null);
    updateGhost(null);
    setIsScrollEnabled(true);

    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (!width || !height) return;

      const hit = screenToCell(absoluteX, absoluteY, { pageX, pageY, width, height }, zoomScaleRef.current);

      if (hit.inside) {
        // Resolved from the ref rather than the occupiedCells memo: this runs
        // from a gesture callback holding an older render's closure.
        const key = cellKey(hit.col, hit.row);
        const target = placedItemsRef.current.find(
          item => item.blocksPlacement && item.occupiedCells().includes(key)
        );
        if (target) handleWater(target.instanceId);
      }
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
    updateGhost({ kind: 'catalog', entry });
    cacheGridBounds();
    // Lock the ScrollView for the duration of the drag. The grid bounds are
    // cached here and measure()'s pageX/pageY are screen coords, so a pan or
    // pinch mid-drag would leave the cache — and the highlight — pointing at
    // the wrong place.
    setIsScrollEnabled(false);
  };

  /**
   * An already-placed object being repositioned. The highlight treats it like a
   * catalog drag so the footprint maths is shared, but records the instance so
   * the object doesn't collide with the cells it's currently sitting in.
   */
  const handleMoveStart = (instanceId: string) => {
    const item = placedItemsRef.current.find(i => i.instanceId === instanceId);
    if (!item) return;

    movingIdRef.current = instanceId;
    updateGhost({ kind: 'catalog', entry: item.entry });
    cacheGridBounds();
  };

  const handleMoveEnd = () => {
    movingIdRef.current = null;
    updateGhost(null);
    setDropTarget(null);
  };

  /**
   * Tracks which cell the finger is over mid-drag, and whether releasing there
   * would do anything — the highlight's colour is that answer.
   *
   * Called on every gesture frame, so it bails early whenever the result would
   * be identical to what's already on screen; a drag crosses many pixels per
   * cell, and re-rendering the grid on each one would be wasteful.
   */
  const handleDragMove = (absoluteX: number, absoluteY: number) => {
    const bounds = gridBoundsRef.current;
    const ghost = activeGhostRef.current;
    if (!bounds || !ghost) return;

    // Same conversion the drop handlers use, so the highlight can't disagree
    // with where the item actually lands.
    const hit = screenToCell(absoluteX, absoluteY, bounds, zoomScaleRef.current);

    if (!hit.inside) {
      setDropTarget(prev => (prev === null ? prev : null));
      return;
    }

    const entry = ghost.kind === 'catalog' ? ghost.entry : null;
    const spanCols = entry?.gridWidth ?? 1;
    const spanRows = entry?.gridHeight ?? 1;

    // Clamp exactly as the drop handlers do, so the highlight sits on the cell
    // the item would actually land on rather than under the finger.
    const col = Math.max(0, Math.min(hit.col, COLUMNS - spanCols));
    const row = Math.max(0, Math.min(hit.row, ROWS - spanRows));

    const occupied = buildOccupancy(placedItemsRef.current);

    let valid: boolean;
    if (ghost.kind === 'can') {
      // Only a thirsty plant can be watered — anything else is a no-op.
      const targetId = occupied[cellKey(col, row)];
      const target = placedItemsRef.current.find(i => i.instanceId === targetId);
      valid = target instanceof PlantObject && target.isThirsty;
    } else if (entry?.kind === 'terrain') {
      // Terrain paints over whatever's there, so it's always a valid drop.
      valid = true;
    } else {
      // An object being repositioned mustn't collide with the cells it's
      // currently occupying, or every move would read as invalid.
      const movingId = movingIdRef.current;

      valid = true;
      for (let c = 0; c < spanCols && valid; c++) {
        for (let r = 0; r < spanRows && valid; r++) {
          const blocker = occupied[cellKey(col + c, row + r)];
          if (blocker && blocker !== movingId) valid = false;
        }
      }
    }

    setDropTarget(prev =>
      prev && prev.col === col && prev.row === row && prev.valid === valid
        ? prev
        : { col, row, valid }
    );
  };

  const handleInventoryDragEnd = (absoluteX: number, absoluteY: number) => {
    // Unconditional cleanup, before any early return and outside the measure()
    // callback — missing setIsScrollEnabled(true) on any path would leave the
    // garden permanently unscrollable.
    setDropTarget(null);
    setIsScrollEnabled(true);

    // Read through the ref, not state: this runs from a gesture callback whose
    // closure was captured when the gesture was built — a render where the drag
    // hadn't started and activeGhost was still null.
    const ghost = activeGhostRef.current;
    const entry = ghost?.kind === 'catalog' ? ghost.entry : null;

    // Cleared up front too: if measure() never calls back, a ghost cleared only
    // inside it would stay stuck to the screen.
    updateGhost(null);

    if (!entry) return;

    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (!width || !height) return;

      const hit = screenToCell(absoluteX, absoluteY, { pageX, pageY, width, height }, zoomScaleRef.current);

      if (hit.inside) {
        const ghostLogicalWidth = entry.gridWidth ?? 1;
        const ghostLogicalHeight = entry.gridHeight ?? 1;

        const targetCol = Math.max(0, Math.min(hit.col, COLUMNS - ghostLogicalWidth));
        const targetRow = Math.max(0, Math.min(hit.row, ROWS - ghostLogicalHeight));

        if (entry.kind === 'terrain') {
          // Terrain paints its own layer, so it never collides with what's
          // already on the cell — planting on grass is the whole point.
          handlePaintTerrain(entry.id, targetCol, targetRow);
        } else {
          // Built from the ref, not the occupiedCells memo — see the note in
          // handleInventoryDragEnd about this closure being stale.
          const occupied = buildOccupancy(placedItemsRef.current);

          let isBlocked = false;
          for (let c = 0; c < ghostLogicalWidth; c++) {
            for (let r = 0; r < ghostLogicalHeight; r++) {
              if (occupied[cellKey(targetCol + c, targetRow + r)]) {
                isBlocked = true;
              }
            }
          }

          if (isBlocked) {
            Vibration.vibrate([0, 50, 50, 50]);
          } else {
            setPlacedItems(prev => {
              const instanceId = Date.now().toString();
              // No stageStartedAt: a new plant starts thirsty and won't grow
              // until it's watered.
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
            {activeGhost.kind === 'can' ? (
              <Image
                source={WATERING_CAN_IMAGE}
                style={{ width: '100%', height: '100%', opacity: 0.9 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : ghostEntry?.image ? (
              <Image
                source={ghostEntry.image}
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

                {dropTarget && (
                  <DropHighlight
                    col={dropTarget.col}
                    row={dropTarget.row}
                    valid={dropTarget.valid}
                  />
                )}

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
                    onMoveStart={handleMoveStart}
                    onDragMove={handleDragMove}
                    onMoveEnd={handleMoveEnd}
                    setScrollEnabled={setIsScrollEnabled}
                    occupiedCells={occupiedCells}
                    zoomScale={zoomScale}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* The watering can is rendered by the inventory so it rides the
              dock's open/close animation. */}
          <GardenInventory
            dragX={activeDragX}
            dragY={activeDragY}
            onDragStart={handleInventoryDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleInventoryDragEnd}
            gardenName={currentGardenName}
            isDropdownOpen={isDropdownOpen}
            onBack={() => router.back()}
            onOpenDropdown={() => setIsDropdownOpen(true)}
            onWaterDragStart={() => {
              updateGhost({ kind: 'can' });
              cacheGridBounds();
              setIsScrollEnabled(false);
            }}
            onWaterDragEnd={handleWaterDragEnd}
          />

        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
}