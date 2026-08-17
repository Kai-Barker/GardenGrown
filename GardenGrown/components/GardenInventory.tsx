import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, FlatList, Animated, PanResponder, Vibration, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SharedValue, runOnJS } from 'react-native-reanimated';

export type CategoryType = 'Plant' | 'Terrain' | 'Decoration';

export type InventoryItem = {
  id: string;
  image: any;
  name: string;
  category: CategoryType;
  gridWidth?: number; 
  gridHeight?: number; 
  isTall?: boolean; 
};

// Updated large items to be 1 wide and 2 tall
export const INVENTORY_ITEMS: InventoryItem[] = [
  // --- PLANTS ---
  { id: '1', image: require('../assets/Plants/Rose.webp'), name: 'Rose', category: 'Plant' },
  { id: '2', image: require('../assets/Plants/Shroom.webp'), name: 'Mushroom', category: 'Plant' },
  { id: '3', image: require('../assets/Plants/Cactus.webp'), name: 'Cactus', category: 'Plant', isTall: true },
  { id: '4', image: require('../assets/Plants/Water Lily.webp'), name: 'Water Lily', category: 'Plant' },
  { id: '5', image: require('../assets/Plants/Red Tulip.webp'), name: 'Red Tulip', category: 'Plant' },
  { id: '6', image: require('../assets/Plants/Blue Dandelion.webp'), name: 'Blue Dandelion', category: 'Plant' },
  { id: '7', image: require('../assets/Plants/Lavender.webp'), name: 'Lavender', category: 'Plant' },
  { id: '8', image: require('../assets/Plants/Brussel Sprout.webp'), name: 'Brussel Sprout', category: 'Plant' },
  { id: '9', image: require('../assets/Plants/Pink Orchid.webp'), name: 'Pink Orchid', category: 'Plant' },
  { id: '10', image: require('../assets/Plants/Purple Vine Flower.webp'), name: 'Purple Vine', category: 'Plant' },
  // Larger Plants
  { id: '11', image: require('../assets/Plants/Berry Bush.webp'), name: 'Berry Bush', category: 'Plant', gridWidth: 1, gridHeight: 1 },
  { id: '12', image: require('../assets/Plants/Cherry Blossom.webp'), name: 'Cherry Blossom', category: 'Plant', gridWidth: 1, gridHeight: 2, isTall: true },
  { id: '13', image: require('../assets/Plants/Oak Tree.webp'), name: 'Oak Tree', category: 'Plant', gridWidth: 1, gridHeight: 2, isTall: true },
  { id: '14', image: require('../assets/Plants/Pink Hibiscus.webp'), name: 'Pink Hibiscus', category: 'Plant' },

  // --- TERRAIN ---
  { id: '15', image: require('../assets/Terrain/Rock.webp'), name: 'Rock', category: 'Terrain', gridWidth: 1, gridHeight: 1 },
  { id: '16', image: require('../assets/Terrain/Vertical Rock.webp'), name: 'Vertical Rock', category: 'Terrain', isTall: true },

  // --- DECORATION ---
  { id: '17', image: require('../assets/Decorations/Stone Bench.webp'), name: 'Stone Bench', category: 'Decoration', gridWidth: 1, gridHeight: 1 },
  { id: '18', image: require('../assets/Decorations/Wood Bench.webp'), name: 'Wood Bench', category: 'Decoration', gridWidth: 1, gridHeight: 1 },
  { id: '19', image: require('../assets/Decorations/Stone Lantern.webp'), name: 'Stone Lantern', category: 'Decoration', isTall: true },
  { id: '20', image: require('../assets/Decorations/Wood Lantern.webp'), name: 'Wood Lantern', category: 'Decoration', isTall: true },
];

const CATEGORY_TABS: { key: CategoryType; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string }[] = [
  { key: 'Plant', icon: 'flower-tulip', label: 'Plants' },
  { key: 'Terrain', icon: 'image-filter-hdr', label: 'Terrain' },
  { key: 'Decoration', icon: 'gate', label: 'Decoration' },
];

const DRAWER_HEIGHT = 440;
const PEEK_HEIGHT = 120;
const CLOSED_TRANSLATE_Y = DRAWER_HEIGHT - PEEK_HEIGHT;

type GardenInventoryProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (item: InventoryItem, startX: number, startY: number) => void;
  onDragEnd: (endX: number, endY: number) => void;
};

export function GardenInventory({ dragX, dragY, onDragStart, onDragEnd }: GardenInventoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryType>('Plant');
  const isExpandedRef = useRef(isExpanded);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const panY = useRef(new Animated.Value(CLOSED_TRANSLATE_Y)).current;

  const filteredItems = useMemo(() => {
    return INVENTORY_ITEMS.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  const snapTo = (toValue: number, expandedState: boolean) => {
    Animated.spring(panY, {
      toValue,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true, 
    }).start();
    setIsExpanded(expandedState);
  };

  const toggleDrawer = () => {
    if (isExpanded) {
      snapTo(CLOSED_TRANSLATE_Y, false);
    } else {
      snapTo(0, true);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        const startY = isExpandedRef.current ? 0 : CLOSED_TRANSLATE_Y;
        let newY = startY + gestureState.dy;

        if (newY < 0) newY = newY * 0.2; 
        if (newY > CLOSED_TRANSLATE_Y + 40) newY = CLOSED_TRANSLATE_Y + 40;

        panY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        const dragDistance = gestureState.dy;
        const velocity = gestureState.vy;

        if (isExpandedRef.current) {
          if (dragDistance > 80 || velocity > 0.4) {
            snapTo(CLOSED_TRANSLATE_Y, false);
          } else {
            snapTo(0, true);
          }
        } else {
          if (dragDistance < -80 || velocity < -0.4) {
            snapTo(0, true);
          } else {
            snapTo(CLOSED_TRANSLATE_Y, false);
          }
        }
      },
    })
  ).current;

  return (
    <Animated.View 
      style={{
        transform: [{ translateY: panY }],
        height: DRAWER_HEIGHT,
      }}
      className="absolute bottom-0 left-0 right-0 z-30"
    >
      <View {...panResponder.panHandlers}>
        <View className="items-center -mb-1 z-10">
          <Pressable 
            onPress={toggleDrawer}
            className="bg-[#9BB49E] border-2 border-[#4A4A4A] px-6 py-1 rounded-t-2xl items-center justify-center active:opacity-80"
          >
            <MaterialCommunityIcons 
              name={isExpanded ? "chevron-down" : "chevron-up"} 
              size={28} 
              color="#4A4A4A" 
            />
          </Pressable>
        </View>

        <View className="w-full bg-[#46546B] border-t-2 border-[#4A4A4A] pt-2 pb-2 flex-row justify-around items-center px-4">
          {CATEGORY_TABS.map((tab, index) => {
            const isActive = activeCategory === tab.key;
            return (
              <React.Fragment key={tab.key}>
                {index > 0 && <View className="w-[1px] h-6 bg-white/20" />}
                <Pressable
                  onPress={() => setActiveCategory(tab.key)}
                  className={`flex-1 items-center py-1 mx-1 rounded-xl active:opacity-70 ${
                    isActive ? 'bg-[#374151]/60' : ''
                  }`}
                >
                  <MaterialCommunityIcons 
                    name={tab.icon} 
                    size={24} 
                    color={isActive ? '#FADBB3' : '#9CA3AF'} 
                  />
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      <View className="flex-1 bg-[#46546B] px-4 pt-2">
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          numColumns={4}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          // This applies a reliable, clean gap between rows and columns
          columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
          ListEmptyComponent={
            <View className="w-full py-12 items-center justify-center">
              <Text className="font-zenmaru text-[#FADBB3]/70 text-lg">
                No {activeCategory.toLowerCase()} items available
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            // Flex 1 ensures all columns distribute remaining space identically
            // max-w-[22%] anchors the sizing so orphaned items on the last row don't stretch
            <View className="flex-1 max-w-[22%] aspect-square">
              <InventoryDraggable 
                item={item} 
                dragX={dragX} 
                dragY={dragY} 
                onDragStart={(draggedItem: InventoryItem, x: number, y: number) => {
                  Vibration.vibrate(50);
                  snapTo(CLOSED_TRANSLATE_Y, false);
                  onDragStart(draggedItem, x, y);
                }}
                onDragEnd={onDragEnd} 
              />
            </View>
          )}
        />
      </View>
    </Animated.View>
  );
}

type InventoryDraggableProps = {
  item: InventoryItem;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (item: InventoryItem, x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
};

function InventoryDraggable({ item, dragX, dragY, onDragStart, onDragEnd }: InventoryDraggableProps) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(250) 
    .onStart((e) => {
      runOnJS(onDragStart)(item, e.absoluteX, e.absoluteY);
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
    })
    .onUpdate((e) => {
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
    })
    .onEnd((e) => {
      runOnJS(onDragEnd)(e.absoluteX, e.absoluteY);
    });

  return (
    <GestureDetector gesture={pan}>
      <View className="flex-1 bg-[#9BB49E] border border-[#374151] rounded-2xl items-center justify-center p-1">
        <Image 
          source={item.image} 
          style={{ width: '85%', height: '85%' }} 
          resizeMode="contain" 
        />
      </View>
    </GestureDetector>
  );
}