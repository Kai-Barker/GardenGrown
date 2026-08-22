import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, Image, ScrollView, Dimensions, Vibration, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  runOnJS,
  interpolate
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GardenInventory, INVENTORY_ITEMS } from '../components/GardenInventory';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

/* CONFIGURATION & TYPES
=================================================== */
const COLUMNS = 8;
const ROWS = 16;
const TOTAL_CELLS = COLUMNS * ROWS;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GRID_WIDTH = screenWidth - 48;
const INNER_GRID_WIDTH = GRID_WIDTH - 4; 
const CELL_SIZE = INNER_GRID_WIDTH / COLUMNS; 
const GRID_HEIGHT = (CELL_SIZE * ROWS) + 4;

const DELETE_THRESHOLD = screenHeight - 150;

type PlantItem = {
  id: string;
  image: any; 
  col: number;
  row: number;
  isTall?: boolean;
  gridWidth?: number;
  gridHeight?: number;
};

/* DRAGGABLE PLANT COMPONENT
=================================================== */
function DraggablePlant({ item, onSnap, onDelete, setScrollEnabled, occupiedCells, zoomScale }: any) {
  const translateX = useSharedValue(item.col * CELL_SIZE);
  const translateY = useSharedValue(item.row * CELL_SIZE);
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const itemWidth = item.gridWidth || 1;
  const itemHeight = item.gridHeight || 1;

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute', 
      width: CELL_SIZE * itemWidth, 
      height: CELL_SIZE * itemHeight,
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
      zIndex: interpolate(isDragging.value ? 1 : 0, [0, 1], [item.row, 999]), 
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
        runOnJS(onDelete)(item.id);
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
          const cellKey = `${newCol + c},${newRow + r}`;
          const blockingItem = occupiedCells[cellKey];
          if (blockingItem && blockingItem !== item.id) {
            isBlocked = true;
          }
        }
      }

      if (isBlocked) {
        runOnJS(Vibration.vibrate)([0, 50, 50, 50]); 
        translateX.value = withSpring(item.col * CELL_SIZE);
        translateY.value = withSpring(item.row * CELL_SIZE);
      } else {
        translateX.value = withSpring(newCol * CELL_SIZE);
        translateY.value = withSpring(newRow * CELL_SIZE);
        runOnJS(onSnap)(item.id, newCol, newRow);
      }
    });

  const isLarge = itemHeight >= 2; 
  const renderCols = isLarge ? 2 : itemWidth;
  const renderRows = isLarge ? 2 : itemHeight;

  const visualWidth = CELL_SIZE * renderCols * 1.5;
  const visualHeight = CELL_SIZE * (item.isTall && !isLarge ? 2 : (renderRows * 1.5));
  
  const leftOffset = -(visualWidth - (CELL_SIZE * itemWidth)) / 2;

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
            source={item.image} 
            style={{ width: '100%', height: '100%' }} 
            resizeMode="contain" 
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
  const [activeGhost, setActiveGhost] = useState<any>(null);
  const [placedItems, setPlacedItems] = useState<any[]>([]);
  
  const gridRef = useRef<View>(null);
  const zoomScaleRef = useRef(1);
  const activeDragX = useSharedValue(0);
  const activeDragY = useSharedValue(0);
  const zoomScale = useSharedValue(1);

  // --- GHOST VISUAL SIZING & ANIMATED STYLE ---
  const isGhostLarge = (activeGhost?.gridHeight || 1) >= 2;
  const ghostRenderCols = isGhostLarge ? 2 : (activeGhost?.gridWidth || 1);
  const ghostRenderRows = isGhostLarge ? 2 : (activeGhost?.gridHeight || 1);
  
  const ghostVisualWidth = CELL_SIZE * ghostRenderCols * 1.5;
  const ghostVisualHeight = CELL_SIZE * (activeGhost?.isTall && !isGhostLarge ? 2 : (ghostRenderRows * 1.5));

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
      const gardensRef = collection(db, 'gardens');
      const q = query(gardensRef, where('OwnerId', '==', auth.currentUser.uid));
      const gardensSnap = await getDocs(q);

      const fetchedList: { id: string; name: string }[] = [];
      gardensSnap.forEach((docSnap) => {
        fetchedList.push({
          id: docSnap.id,
          name: docSnap.data().GardenTheme || 'Untitled Garden',
        });
      });

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
        const gardenRef = doc(db, 'gardens', currentGardenDocId);
        const gardenSnap = await getDoc(gardenRef);

        if (gardenSnap.exists()) {
          const data = gardenSnap.data();
          setCurrentGardenName(data.GardenTheme || 'My Garden');
          
          if (data.PlacedItems && Array.isArray(data.PlacedItems)) {
            const reconstructedItems = data.PlacedItems.map((savedItem: any) => {
              const catalogItem = INVENTORY_ITEMS.find(i => i.id === savedItem.catalogId);
              return {
                id: savedItem.instanceId,
                catalogId: savedItem.catalogId,
                image: catalogItem?.image,
                col: savedItem.col,
                row: savedItem.row,
                isTall: catalogItem?.isTall || false,
                gridWidth: catalogItem?.gridWidth || 1,
                gridHeight: catalogItem?.gridHeight || 1,
              };
            }).filter((item: any) => item.image);

            setPlacedItems(reconstructedItems);
          } else {
            setPlacedItems([]);
          }
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
  const saveGardenData = async (newPlacedItems: any[]) => {
    if (!currentGardenDocId) return;

    try {
      const gardenRef = doc(db, 'gardens', currentGardenDocId);
      
      const firestoreItems = newPlacedItems.map(item => ({
        instanceId: item.id,
        catalogId: item.catalogId,
        col: item.col,
        row: item.row
      }));

      await updateDoc(gardenRef, {
        PlacedItems: firestoreItems,
        TotalEntities: firestoreItems.length
      });
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
              const newGardenRef = await addDoc(collection(db, 'gardens'), {
                OwnerId: auth.currentUser.uid,
                GardenTheme: name,
                TotalEntities: 0,
                PlacedItems: [],
                CreatedAt: serverTimestamp()
              });
              
              setCurrentGardenDocId(newGardenRef.id);
              setCurrentGardenName(name);
              setPlacedItems([]);
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

  const handleScroll = (e: any) => {
    const currentScale = e?.nativeEvent?.zoomScale;
    if (currentScale && currentScale > 0) {
      zoomScale.value = currentScale;
      zoomScaleRef.current = currentScale;
    }
  };

  const occupiedCells = useMemo(() => {
    const map: Record<string, string> = {};
    placedItems.forEach(item => {
      const gw = item.gridWidth || 1;
      const gh = item.gridHeight || 1;
      for (let c = 0; c < gw; c++) {
        for (let r = 0; r < gh; r++) {
          map[`${item.col + c},${item.row + r}`] = item.id;
        }
      }
    });
    return map;
  }, [placedItems]);

  const handleSnap = (id: string, newCol: number, newRow: number) => {
    setPlacedItems(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, col: newCol, row: newRow } : item);
      saveGardenData(updated); 
      return updated;
    });
  };

  const handleDelete = (id: string) => {
    setPlacedItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      saveGardenData(updated); 
      return updated;
    });
  };

  const handleInventoryDragStart = (item: any) => {
    setActiveGhost(item);
  };

  const handleInventoryDragEnd = (absoluteX: number, absoluteY: number) => {
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
        
        const ghostLogicalWidth = activeGhost.gridWidth || 1;
        const ghostLogicalHeight = activeGhost.gridHeight || 1;

        let targetCol = Math.floor(relativeX / scaledCellSize);
        let targetRow = Math.floor(relativeY / scaledCellSize);
        targetCol = Math.max(0, Math.min(targetCol, COLUMNS - ghostLogicalWidth));
        targetRow = Math.max(0, Math.min(targetRow, ROWS - ghostLogicalHeight));

        let isBlocked = false;
        for (let c = 0; c < ghostLogicalWidth; c++) {
          for (let r = 0; r < ghostLogicalHeight; r++) {
            if (occupiedCells[`${targetCol + c},${targetRow + r}`]) {
              isBlocked = true;
            }
          }
        }

        if (isBlocked) {
          Vibration.vibrate([0, 50, 50, 50]); 
        } else {
          setPlacedItems(prev => {
            const newItem = {
              id: Date.now().toString(), 
              catalogId: activeGhost.id, 
              image: activeGhost.image,
              col: targetCol,
              row: targetRow,
              isTall: activeGhost.isTall || false,
              gridWidth: ghostLogicalWidth,
              gridHeight: ghostLogicalHeight
            };
            const updated = [...prev, newItem];
            saveGardenData(updated); 
            return updated;
          });
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
              className="w-[85%] bg-[#F4EFE6] border-2 border-[#4A4A4A]/30 rounded-2xl p-4 shadow-xl"
              onPress={(e) => e.stopPropagation()} 
            >
              <Text className="font-zenmaru-bold text-xl text-[#4A4A4A] mb-3 border-b border-[#4A4A4A]/20 pb-2">
                Select Garden
              </Text>

              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                {userGardens.map((g) => {
                  const isSelected = g.id === currentGardenDocId;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => handleSelectGarden(g.id)}
                      className={`flex-row justify-between items-center p-3 rounded-xl mb-1 ${
                        isSelected ? 'bg-[#4A4A4A]/10' : 'active:bg-[#4A4A4A]/5'
                      }`}
                    >
                      <Text className={`font-zenmaru text-lg ${isSelected ? 'text-[#4A4A4A] font-bold' : 'text-gray-600'}`}>
                        {g.name}
                      </Text>
                      {isSelected && (
                        <MaterialCommunityIcons name="check" size={20} color="#4A4A4A" />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View className="border-t border-[#4A4A4A]/20 mt-2 pt-2">
                <Pressable
                  onPress={() => {
                    setIsDropdownOpen(false);
                    handleCreateNewGarden();
                  }}
                  className="flex-row items-center gap-x-2 p-3 rounded-xl bg-[#4A4A4A]/10 active:opacity-70"
                >
                  <MaterialCommunityIcons name="plus" size={22} color="#4A4A4A" />
                  <Text className="font-zenmaru-bold text-lg text-[#4A4A4A]">Create New Garden</Text>
                </Pressable>
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
            <Image 
              source={activeGhost.image} 
              style={{ width: '100%', height: '100%', opacity: 0.8 }} 
              resizeMode="contain" 
            />
          </Animated.View>
        )}

        <View pointerEvents="none" className="absolute inset-0 z-0">
          <Image source={require('../assets/textures/SandTextureVertical.webp')} className="w-full h-full opacity-30" resizeMode="cover" />
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
                <View className="absolute inset-0 flex-row flex-wrap pointer-events-none">
                  {Array.from({ length: TOTAL_CELLS }).map((_, index) => (
                    <View key={`cell-${index}`} style={{ width: '12.5%', height: CELL_SIZE }} className="border border-[#4A4A4A]/10" />
                  ))}
                </View>

                {placedItems.map(item => (
                  <DraggablePlant 
                    key={item.id} 
                    item={item} 
                    onSnap={handleSnap}
                    onDelete={handleDelete}
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