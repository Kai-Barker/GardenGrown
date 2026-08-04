import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Animated, PanResponder, Vibration } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SharedValue, runOnJS } from 'react-native-reanimated';

// 1. Define our specific item type
export type InventoryItem = {
  id: string;
  emoji: string;
  name: string;
};

const INVENTORY_ITEMS: InventoryItem[] = [
  { id: '1', emoji: '🎋', name: 'Bamboo' },
  { id: '2', emoji: '🌸', name: 'Cherry Blossom' },
  { id: '3', emoji: '🍃', name: 'Leaves' },
  { id: '4', emoji: '🌾', name: 'Rice' },
  { id: '5', emoji: '🌻', name: 'Sunflower' },
  { id: '6', emoji: '🪵', name: 'Logs' },
  { id: '7', emoji: '🍂', name: 'Autumn Leaves' },
  { id: '8', emoji: '🍄', name: 'Mushroom' },
  { id: '9', emoji: '🌳', name: 'Tree' },
  { id: '10', emoji: '🌲', name: 'Pine' },
  { id: '11', emoji: '🌵', name: 'Cactus' },
  { id: '12', emoji: '🌿', name: 'Sprig' },
  { id: '13', emoji: '🪷', name: 'Lotus' },
  { id: '14', emoji: '⛩️', name: 'Torii' },
  { id: '15', emoji: '🎐', name: 'Wind Chime' },
  { id: '16', emoji: '🏺', name: 'Vase' },
];

const DRAWER_HEIGHT = 440;
const PEEK_HEIGHT = 120;
const CLOSED_TRANSLATE_Y = DRAWER_HEIGHT - PEEK_HEIGHT;

// 2. Strongly type the props for the Drawer
type GardenInventoryProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (item: InventoryItem, startX: number, startY: number) => void;
  onDragEnd: (endX: number, endY: number) => void;
};

export function GardenInventory({ dragX, dragY, onDragStart, onDragEnd }: GardenInventoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandedRef = useRef(isExpanded);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const panY = useRef(new Animated.Value(CLOSED_TRANSLATE_Y)).current;

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

        <View className="w-full bg-[#46546B] border-t-2 border-[#4A4A4A] pt-3 pb-2 flex-row justify-around items-center px-4">
          <View className="flex-1 items-center">
            <Text className="text-2xl">🌹</Text>
          </View>
          <View className="w-[1px] h-6 bg-white/20" />
          <View className="flex-1 items-center">
            <Text className="text-2xl">🪨</Text>
          </View>
          <View className="w-[1px] h-6 bg-white/20" />
          <View className="flex-1 items-center">
            <Text className="text-2xl">⛩️</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 bg-[#46546B] px-4 pt-2">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="flex-row flex-wrap justify-between">
            {INVENTORY_ITEMS.map((item) => (
              <InventoryDraggable 
                key={item.id} 
                item={item} 
                dragX={dragX} 
                dragY={dragY} 
                // 3. Rename the parameter so it doesn't clash with the 'item' above, and explicitly type everything
                onDragStart={(draggedItem: InventoryItem, x: number, y: number) => {
                  Vibration.vibrate(50); // Tactile feedback
                  snapTo(CLOSED_TRANSLATE_Y, false); // Snap drawer shut instantly
                  onDragStart(draggedItem, x, y); // Pass to main screen to spawn ghost
                }}
                onDragEnd={onDragEnd} 
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}

// 4. Strongly type the props for the individual draggable component
type InventoryDraggableProps = {
  item: InventoryItem;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (item: InventoryItem, x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
};

// --- NEW GESTURE DRAGGABLE COMPONENT (Typed) ---
function InventoryDraggable({ item, dragX, dragY, onDragStart, onDragEnd }: InventoryDraggableProps) {
  const pan = Gesture.Pan()
    // Waits 250ms of holding before capturing the gesture.
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
      <View className="w-[22%] aspect-square bg-[#9BB49E] border border-[#374151] rounded-2xl items-center justify-center mb-3">
        <Text className="text-3xl">{item.emoji}</Text>
      </View>
    </GestureDetector>
  );
}