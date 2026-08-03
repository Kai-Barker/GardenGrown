import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  Pressable, 
  ScrollView, 
  Animated, 
  PanResponder 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const INVENTORY_ITEMS = [
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

// Heights configuration
const DRAWER_HEIGHT = 440;
const PEEK_HEIGHT = 120;
const CLOSED_TRANSLATE_Y = DRAWER_HEIGHT - PEEK_HEIGHT; // 320px down

export function GardenInventory() {
  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandedRef = useRef(isExpanded);

  // Sync ref with state for gesture callbacks
  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  // Animated Position (0 = Fully Open, CLOSED_TRANSLATE_Y = Peeking)
  const panY = useRef(new Animated.Value(CLOSED_TRANSLATE_Y)).current;

  // Helper function to snap drawer open or closed
  const snapTo = (toValue: number, expandedState: boolean) => {
    Animated.spring(panY, {
      toValue,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true, // Native driver for smooth 60fps UI performance
    }).start();
    setIsExpanded(expandedState);
  };

  // Tap handler for button
  const toggleDrawer = () => {
    if (isExpanded) {
      snapTo(CLOSED_TRANSLATE_Y, false);
    } else {
      snapTo(0, true);
    }
  };

  // PAN RESPONDER (Swipe Gesture Detection)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only take over gesture if moving vertically more than 5px
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        const startY = isExpandedRef.current ? 0 : CLOSED_TRANSLATE_Y;
        let newY = startY + gestureState.dy;

        // Clamping & rubber-banding
        if (newY < 0) newY = newY * 0.2; // Resist dragging above open position
        if (newY > CLOSED_TRANSLATE_Y + 40) newY = CLOSED_TRANSLATE_Y + 40;

        panY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        const dragDistance = gestureState.dy;
        const velocity = gestureState.vy;

        if (isExpandedRef.current) {
          // If open, drag down or flick down to close
          if (dragDistance > 80 || velocity > 0.4) {
            snapTo(CLOSED_TRANSLATE_Y, false);
          } else {
            snapTo(0, true);
          }
        } else {
          // If closed, drag up or flick up to open
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
      {/* 
        1. DRAG HANDLE & HEADER (Attach gesture handlers here)
        This prevents gesture conflicts with internal item scrolling
      */}
      <View {...panResponder.panHandlers}>
        
        {/* GREEN PULL-TAB BUTTON */}
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

        {/* QUICK ACCESS TOP BAR */}
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

      {/* 2. EXPANDABLE ITEM GRID BODY */}
      <View className="flex-1 bg-[#46546B] px-4 pt-2">
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View className="flex-row flex-wrap justify-between">
            {INVENTORY_ITEMS.map((item) => (
              <Pressable
                key={item.id}
                className="w-[22%] aspect-square bg-[#9BB49E] border border-[#374151] rounded-2xl items-center justify-center mb-3 active:scale-95"
                onPress={() => console.log('Selected item:', item.name)}
              >
                <Text className="text-3xl">{item.emoji}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

    </Animated.View>
  );
}