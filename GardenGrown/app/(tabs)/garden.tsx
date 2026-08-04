import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, Image, ScrollView, Dimensions, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  runOnJS,
  interpolate
} from 'react-native-reanimated';
import { GardenInventory } from '../../components/GardenInventory';

// --- 1. GRID CONFIGURATION ---
const COLUMNS = 8;
const ROWS = 12;
const TOTAL_CELLS = COLUMNS * ROWS;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GRID_WIDTH = screenWidth - 48;
const INNER_GRID_WIDTH = GRID_WIDTH - 4; 
const CELL_SIZE = INNER_GRID_WIDTH / COLUMNS; 
const GRID_HEIGHT = (CELL_SIZE * ROWS) + 4;

// The Y-coordinate threshold for deletion (approx bottom 150px of the screen)
const DELETE_THRESHOLD = screenHeight - 150;

type PlantItem = {
  id: string;
  emoji: string;
  col: number;
  row: number;
  isTall: boolean;
};

// --- 2. CRASH-SAFE DRAGGABLE PLANT ---
function DraggablePlant({ item, onSnap, onDelete, setScrollEnabled, occupiedCells, zoomScale }: any) {
  const translateX = useSharedValue(item.col * CELL_SIZE);
  const translateY = useSharedValue(item.row * CELL_SIZE);
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute', 
      width: CELL_SIZE, 
      height: CELL_SIZE,
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

      // --- NEW: DELETION CHECK ---
      // If dropped near the bottom of the screen (the inventory drawer)
      if (event.absoluteY > DELETE_THRESHOLD) {
        runOnJS(Vibration.vibrate)([0, 50, 100, 50]); // Distinct "delete" vibration pattern
        runOnJS(onDelete)(item.id);
        return; // Exit early so it doesn't try to snap
      }

      const currentX = translateX.value;
      const currentY = translateY.value;

      let newCol = Math.round(currentX / CELL_SIZE);
      let newRow = Math.round(currentY / CELL_SIZE);
      newCol = Math.max(0, Math.min(newCol, COLUMNS - 1));
      newRow = Math.max(0, Math.min(newRow, ROWS - 1));

      const cellKey = `${newCol},${newRow}`;
      const blockingItem = occupiedCells[cellKey];
      const isBlocked = blockingItem && blockingItem !== item.id;

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

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <View style={{ position: 'absolute', bottom: 0, width: '100%', height: item.isTall ? CELL_SIZE * 2.2 : CELL_SIZE, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: item.isTall ? CELL_SIZE * 1.5 : CELL_SIZE * 0.7, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 4 }}>
            {item.emoji}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// --- 3. MAIN GARDEN SCREEN ---
export default function GardenScreen() {
  const router = useRouter();
  const [isScrollEnabled, setIsScrollEnabled] = useState(true);
  
  // Ghost Item State
  const [activeGhost, setActiveGhost] = useState<any>(null);
  const activeDragX = useSharedValue(0);
  const activeDragY = useSharedValue(0);

  // Zoom Tracking Values with Safe Fallbacks
  const zoomScale = useSharedValue(1);
  const zoomScaleRef = useRef(1);

  const handleScroll = (e: any) => {
    const currentScale = e?.nativeEvent?.zoomScale;
    if (currentScale && currentScale > 0) {
      zoomScale.value = currentScale;
      zoomScaleRef.current = currentScale;
    }
  };

  const gridRef = useRef<View>(null);

  const [placedItems, setPlacedItems] = useState<PlantItem[]>([
    { id: '1', emoji: '🍄', col: 2, row: 4, isTall: false },
    { id: '2', emoji: '🪷', col: 5, row: 8, isTall: false },
  ]);

  const occupiedCells = useMemo(() => {
    const map: Record<string, string> = {};
    placedItems.forEach(item => {
      map[`${item.col},${item.row}`] = item.id;
    });
    return map;
  }, [placedItems]);

  const handleSnap = (id: string, newCol: number, newRow: number) => {
    setPlacedItems(prev => prev.map(item => item.id === id ? { ...item, col: newCol, row: newRow } : item));
  };

  // --- NEW: DELETE HANDLER ---
  const handleDelete = (id: string) => {
    setPlacedItems(prev => prev.filter(item => item.id !== id));
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
        
        let targetCol = Math.floor(relativeX / scaledCellSize);
        let targetRow = Math.floor(relativeY / scaledCellSize);
        
        targetCol = Math.max(0, Math.min(targetCol, COLUMNS - 1));
        targetRow = Math.max(0, Math.min(targetRow, ROWS - 1));

        if (occupiedCells[`${targetCol},${targetRow}`]) {
          Vibration.vibrate([0, 50, 50, 50]); 
        } else {
          const isTallItem = ['Tree', 'Pine', 'Torii'].includes(activeGhost?.name || '');
          setPlacedItems(prev => [...prev, {
            id: Date.now().toString(),
            emoji: activeGhost.emoji,
            col: targetCol,
            row: targetRow,
            isTall: isTallItem
          }]);
        }
      }
      setActiveGhost(null);
    });
  };

  const ghostAnimatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    transform: [
      { translateX: activeDragX.value - (CELL_SIZE / 2) },
      { translateY: activeDragY.value - CELL_SIZE }
    ],
    zIndex: 9999,
    pointerEvents: 'none',
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-[#F4EFE6]">
        
        {/* Global Ghost Item Layer */}
        {activeGhost && (
          <Animated.View style={ghostAnimatedStyle}>
            <Text style={{ 
              fontSize: ['Tree', 'Pine', 'Torii'].includes(activeGhost.name) ? CELL_SIZE * 1.5 : CELL_SIZE * 0.7,
              textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 4,
              opacity: 0.8
            }}>
              {activeGhost.emoji}
            </Text>
          </Animated.View>
        )}

        <View pointerEvents="none" className="absolute inset-0 z-0">
          <Image source={require('../../assets/textures/SandTextureVertical.webp')} className="w-full h-full opacity-30" resizeMode="cover" />
        </View>

        <SafeAreaView className="flex-1 justify-between" edges={['top']}>
          
          <View className="px-6 pt-2 z-10">
            <Pressable onPress={() => router.back()} className="flex-row items-center mb-2 active:opacity-60">
              <MaterialCommunityIcons name="chevron-left" size={28} color="#4A4A4A" />
              <Text className="font-zenmaru text-2xl text-[#4A4A4A]">Dashboard</Text>
            </Pressable>
            <Pressable className="flex-row items-center gap-x-2">
              <Text className="font-zenmaru-bold text-4xl text-[#4A4A4A]">Raked Sand</Text>
              <MaterialCommunityIcons name="chevron-down" size={32} color="#4A4A4A" />
            </Pressable>
          </View>

          <View className="flex-1 z-0 mt-4 mb-4">
            <ScrollView
              scrollEnabled={isScrollEnabled} 
              maximumZoomScale={3} 
              minimumZoomScale={1} 
              bouncesZoom={true} 
              centerContent={true}
              showsHorizontalScrollIndicator={false} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
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
                    onDelete={handleDelete} // Passed the new delete function down
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
          />

        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
}