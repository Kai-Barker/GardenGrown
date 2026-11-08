import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Vibration, ActivityIndicator, Alert, Modal, type ViewInstance } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  type SharedValue
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GardenInventory } from '../components/GardenInventory';
import CreateGardenModal from '../components/CreateGardenModal';
import {
  CELL_SIZE,
  COLUMNS,
  DELETE_THRESHOLD,
  GRID_HEIGHT,
  GRID_WIDTH,
  TOTAL_CELLS,
  computeVisualBox,
} from '../components/Garden/constants';
import { PlacedObject, PlantObject } from '../components/Garden/objects';
import { GROWTH_TICK_MS } from '../components/Garden/growth';
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
} from '../components/Garden/placement';
import TerrainLayer from '../components/Garden/TerrainLayer';
import DropHighlight from '../components/Garden/DropHighlight';
import { WATERING_CAN_IMAGE } from '../components/Garden/WateringCan';
import type { CatalogEntry, TerrainMap } from '../components/Garden/types';
import { auth } from '../firebase';
import {
  getUserGardens,
  getGarden,
  createGarden,
  saveGardenLayout,
  deleteGarden,
} from '../services/garden';

/** Size of the dragged watering can, in grid cells. */
const CAN_GHOST_CELLS = 1.5;

/** Colour of the hint shown over a plant that's waiting to be watered. */
const THIRSTY_COLOR = '#3B82F6';

/** The cell a drag is currently over, and whether dropping there does anything. */
type DropTarget = { col: number; row: number; valid: boolean };

// Grid maths (screenToCell, occupancy, clamping, collision, drop resolution)
// lives in components/Garden/placement.ts, where it's unit tested. Gesture
// callbacks rebuild occupancy from a ref via buildOccupancy rather than closing
// over the memoised copy, which would be stale by the time they run.

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

/**
 * One placed object on the grid. Draws its art (oversized and bottom-anchored
 * to its footprint, with a droplet hint when thirsty) and handles dragging it:
 * following the finger while zoomed, deleting it if dropped in the delete
 * zone, and otherwise snapping it to the nearest free cell — or springing back
 * with a buzz if that spot is taken.
 */
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
      isDragging.set(true);
      scheduleOnRN(setScrollEnabled, false);
      // Only the id crosses the worklet boundary — scheduleOnRN serialises its
      // arguments, and a PlacedObject instance can't survive that.
      scheduleOnRN(onMoveStart, instanceId);
      startX.set(translateX.value);
      startY.set(translateY.value);
    })
    .onUpdate((event) => {
      const currentScale = (zoomScale && zoomScale.value > 0) ? zoomScale.value : 1;
      translateX.set(startX.value + (event.translationX / currentScale));
      translateY.set(startY.value + (event.translationY / currentScale));
      scheduleOnRN(onDragMove, event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      isDragging.set(false);
      scheduleOnRN(setScrollEnabled, true);
      scheduleOnRN(onMoveEnd); 

      if (event.absoluteY > DELETE_THRESHOLD) {
        scheduleOnRN(Vibration.vibrate, [0, 50, 100, 50]);
        scheduleOnRN(onDelete, instanceId);
        return;
      }

      // Both helpers are worklets, so they're safe to call on the UI thread.
      const { col: newCol, row: newRow } = snapFromTranslation(
        translateX.value, translateY.value, CELL_SIZE, itemWidth, itemHeight,
      );
      // Ignore our own id: an object can be nudged onto cells it already covers.
      const isBlocked =
        findBlocker(occupiedCells, newCol, newRow, itemWidth, itemHeight, instanceId) !== null;

      if (isBlocked) {
        scheduleOnRN(Vibration.vibrate, [0, 50, 50, 50]);
        translateX.set(withSpring(col * CELL_SIZE));
        translateY.set(withSpring(row * CELL_SIZE));
      } else {
        translateX.set(withSpring(newCol * CELL_SIZE));
        translateY.set(withSpring(newRow * CELL_SIZE));
        scheduleOnRN(onSnap, instanceId, newCol, newRow);
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
/**
 * The garden editor. Loads the selected garden (or the user's first one),
 * shows the zoomable grid with its terrain and placed objects, and handles
 * every edit: dragging items in from the inventory, moving and deleting them,
 * painting terrain, watering plants, and growing them over time. Every change
 * is saved straight to Firestore. Also hosts the garden switcher and the
 * create-garden modal (mandatory when the user has no gardens yet).
 */
export default function GardenScreen() {
  const router = useRouter();
  const { gardenId } = useLocalSearchParams<{ gardenId: string }>();

  const [loading, setLoading] = useState(true);
  const [currentGardenDocId, setCurrentGardenDocId] = useState<string | null>(gardenId || null);
  const [currentGardenName, setCurrentGardenName] = useState('Loading...');
  
  const [userGardens, setUserGardens] = useState<{ id: string; name: string }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  /** True once the garden list has been fetched at least once. Distinct from
   *  `loading`, which tracks a single garden's contents — the lock can only be
   *  judged after the list itself has come back. */
  const [gardensLoaded, setGardensLoaded] = useState(false);

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
  // stale closure — those fire via scheduleOnRN and hold the props from the render
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

  const gridRef = useRef<ViewInstance>(null);
  const zoomScaleRef = useRef(1);

  // The grid's page position, cached when a drag starts. measure() is an async
  // native call, so the live drop highlight can't afford one per frame.
  const gridBoundsRef = useRef<{ pageX: number; pageY: number; width: number; height: number } | null>(null);

  /** Measures the grid's on-screen position into gridBoundsRef for the drag highlight to use. */
  const cacheGridBounds = () => {
    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (width && height) gridBoundsRef.current = { pageX, pageY, width, height };
    });
  };
  const activeDragX = useSharedValue(0);
  const activeDragY = useSharedValue(0);
  const zoomScale = useSharedValue(1);

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

  /**
   * Loads the user's gardens for the switcher, and opens the first one if no
   * garden was passed in. Always marks the list as loaded, even on failure.
   */
  const fetchUserGardens = async () => {
    if (!auth.currentUser) return;
    try {
      const userGardens = await getUserGardens(auth.currentUser.uid);

      const fetchedList = userGardens.map((garden) => ({
        id: garden.id,
        name: garden.GardenTheme || 'Untitled Garden',
      }));

      setUserGardens(fetchedList);

      if (!currentGardenDocId && fetchedList.length > 0) {
        setCurrentGardenDocId(fetchedList[0].id);
      }
    } catch (error) {
      console.error("Error fetching user gardens:", error);
    } finally {
      // Set even on failure: the lock needs to resolve one way or the other,
      // or a network error would leave the screen stuck on the spinner.
      setGardensLoaded(true);
    }
  };

  // Once on mount only. The list doesn't change when the user merely switches
  // gardens, and refetching on every switch was a wasted query; create and
  // delete refresh it explicitly instead.
  useEffect(() => {
    // Async fetch — state is only set after the await, so this doesn't cascade renders
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUserGardens();
  }, []);

  useEffect(() => {
    /**
     * Loads the selected garden's document and swaps its name, objects and
     * terrain into state. Alerts if it can't be loaded.
     */
    const fetchGarden = async () => {
      if (!currentGardenDocId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const data = await getGarden(currentGardenDocId);

        if (data) {
          // Drops unknown/corrupt items, catches plant growth up to now, and
          // defaults a missing Terrain field — see parseGardenDoc.
          const { name, items: loadedItems, terrain: loadedTerrain } = parseGardenDoc(data);

          setCurrentGardenName(name);
          setPlacedItems(loadedItems);
          placedItemsRef.current = loadedItems;

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

  /**
   * Saves the garden's objects and terrain together. Callers pass whichever
   * half they just changed; the other half comes from the ref, which always
   * holds the latest committed value (plain state would be stale inside a
   * setState updater, where most of these calls happen). Errors are logged,
   * not shown.
   */
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

  /** Opens the create-garden modal. */
  const handleCreateNewGarden = () => setIsCreateOpen(true);

  /**
   * Creates a garden with the given name, switches to it with an empty grid,
   * and adds it to the switcher list. Alerts if creation fails.
   */
  const handleCreateSubmit = async (name: string) => {
    if (!auth.currentUser) return;

    try {
      setIsCreating(true);
      const newGardenId = await createGarden(auth.currentUser.uid, name);

      setCurrentGardenDocId(newGardenId);
      setCurrentGardenName(name);
      setPlacedItems([]);
      placedItemsRef.current = [];
      // Clear terrain too, or the previous garden's tiles would be
      // rendered over — and then saved into — the new empty garden.
      setTerrain({});
      terrainRef.current = {};

      // The list no longer refreshes on selection change, so add the new
      // garden to it here rather than refetching the whole collection.
      setUserGardens(prev => [...prev, { id: newGardenId, name }]);
      setIsCreateOpen(false);
    } catch (error) {
      console.error("Error creating garden:", error);
      Alert.alert("Error", "Could not create garden.");
    } finally {
      setIsCreating(false);
    }
  };

  /** Switches to another garden from the switcher and closes it. */
  const handleSelectGarden = (id: string) => {
    setCurrentGardenDocId(id);
    setIsDropdownOpen(false);
  };

  /**
   * The user has no garden to plant in. Gated on gardensLoaded so the modal
   * doesn't flash before the list comes back on a cold open.
   */
  const hasNoGardens = gardensLoaded && !currentGardenDocId && userGardens.length === 0;

  /**
   * Whether the garden can be edited at all. Every mutation checks this — the
   * modal is the UX, but a view concern shouldn't be the only thing standing
   * between a drag and a write against a garden that doesn't exist.
   */
  const canEdit = !!currentGardenDocId;

  /**
   * Asks for confirmation, then deletes a garden. If it was the open one, opens
   * the next garden — or, if none are left, returns to the dashboard.
   */
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

  /** Records the ScrollView's current zoom so drags and drops can convert touches correctly. */
  const handleScroll = (e: any) => {
    const currentScale = e?.nativeEvent?.zoomScale;
    if (currentScale && currentScale > 0) {
      zoomScale.value = currentScale;
      zoomScaleRef.current = currentScale;
    }
  };

  const occupiedCells = useMemo(() => buildOccupancy(placedItems), [placedItems]);

  /** Moves an object to a new cell (after a successful drag) and saves. */
  const handleSnap = (id: string, newCol: number, newRow: number) => {
    setPlacedItems(prev => {
      const updated = prev.map(item =>
        item.instanceId === id ? item.moveTo(newCol, newRow) : item
      );
      saveGardenData(updated);
      return updated;
    });
  };

  /** Removes an object (dragged into the delete zone) and saves. */
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

    if (!canEdit) return;

    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (!width || !height) return;

      const hit = screenToCell(absoluteX, absoluteY, { pageX, pageY, width, height }, zoomScaleRef.current);
      // Same clamp the highlight uses, so the can waters what was highlighted.
      const cell = resolveDropCell(hit, { kind: 'can' });

      if (cell) {
        // Resolved from the ref rather than the occupiedCells memo: this runs
        // from a gesture callback holding an older render's closure.
        const target = findObjectAtCell(placedItemsRef.current, cell.col, cell.row);
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
    if (!canEdit) return;

    setTerrain(prev => {
      const updated = applyTerrainPaint(prev, catalogId, col, row);
      // Unchanged (repainting the same tile, erasing a bare cell, an unknown
      // id) — skip the re-render and the write.
      if (updated === prev) return prev;

      saveGardenData(undefined, updated);
      return updated;
    });
  };

  /** Starts dragging a catalog item: shows its ghost and locks scrolling until the drop. */
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

  /** Clears the ghost and highlight once a placed object is released. */
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

    // Clamped exactly as the drop handlers clamp, so the highlight sits on the
    // cell the item would actually land on rather than under the finger.
    const cell = resolveDropCell(hit, ghost);

    if (!cell) {
      setDropTarget(prev => (prev === null ? prev : null));
      return;
    }

    const { col, row } = cell;
    // movingId: an object being repositioned mustn't collide with its own cells.
    const valid = isDropValid(ghost, placedItemsRef.current, col, row, movingIdRef.current);

    setDropTarget(prev =>
      prev && prev.col === col && prev.row === row && prev.valid === valid
        ? prev
        : { col, row, valid }
    );
  };

  /**
   * Drops a catalog item where the finger was released: paints terrain, places
   * a new object and saves it, or buzzes if the cells are taken. Does nothing
   * off the grid or when there's no garden to edit.
   */
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

    if (!entry || !canEdit) return;

    gridRef.current?.measure((x, y, width, height, pageX, pageY) => {
      if (!width || !height) return;

      const hit = screenToCell(absoluteX, absoluteY, { pageX, pageY, width, height }, zoomScaleRef.current);
      const cell = resolveDropCell(hit, { kind: 'catalog', entry });
      if (!cell) return;

      // Resolved against the ref, not the occupiedCells memo — this closure is
      // from the render that built the gesture, so its state is stale.
      const result = resolveCatalogDrop(entry, placedItemsRef.current, cell.col, cell.row);

      if (result.type === 'paint') {
        handlePaintTerrain(result.catalogId, result.col, result.row);
      } else if (result.type === 'blocked') {
        Vibration.vibrate([0, 50, 50, 50]);
      } else {
        // A new plant has no stageStartedAt: it starts thirsty and won't grow
        // until it's watered.
        setPlacedItems(prev => {
          const updated = [...prev, result.item];
          saveGardenData(updated);
          return updated;
        });
      }
    });
  };

  // Wait for the garden list too, not just the current garden's contents —
  // otherwise a user with no gardens briefly sees an empty, unusable grid
  // before the lock resolves.
  if (loading || !gardensLoaded) {
    return (
      <View className="flex-1 bg-[#F4EFE6] items-center justify-center">
        <ActivityIndicator size="large" color="#4A4A4A" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-[#F4EFE6]">

        {/* Mandatory when the user has no gardens, since the grid behind it
            can't save anything without a garden document. */}
        <CreateGardenModal
          visible={isCreateOpen || hasNoGardens}
          mandatory={hasNoGardens}
          busy={isCreating}
          onCancel={() => setIsCreateOpen(false)}
          onCreate={handleCreateSubmit}
          onBackToDashboard={() => router.replace('/(tabs)/dashboard')}
        />

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