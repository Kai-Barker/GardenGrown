import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, FlatList, Animated, PanResponder, Vibration } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SharedValue, runOnJS } from 'react-native-reanimated';
import { getEntriesByKind } from './Garden/catalog';
import { DRAWER_HEIGHT, PEEK_HEIGHT } from './Garden/constants';
import WateringCan, { CAN_RESERVE } from './Garden/WateringCan';
import type { CatalogEntry, ObjectKind } from './Garden/types';

const CATEGORY_TABS: { key: ObjectKind; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string }[] = [
  { key: 'plant', icon: 'flower-tulip', label: 'Plants' },
  { key: 'terrain', icon: 'image-filter-hdr', label: 'Terrain' },
  { key: 'decoration', icon: 'gate', label: 'Decoration' },
];

/**
 * How far down the drawer slides when closed, leaving PEEK_HEIGHT of dock on
 * screen.
 *
 * Unaffected by CAN_RESERVE: the container grew by that amount but is
 * bottom-anchored and pads the same amount at the top, so the drawer content
 * still starts exactly DRAWER_HEIGHT above the screen bottom.
 */
const CLOSED_TRANSLATE_Y = DRAWER_HEIGHT - PEEK_HEIGHT;

type GardenInventoryProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (item: CatalogEntry, startX: number, startY: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (endX: number, endY: number) => void;
  gardenName: string;
  isDropdownOpen: boolean;
  onBack: () => void;
  onOpenDropdown: () => void;
  /** Watering can — rendered here so it rides the dock's animation. */
  onWaterDragStart: () => void;
  onWaterDragEnd: (x: number, y: number) => void;
};

export function GardenInventory({
  dragX,
  dragY,
  onDragStart,
  onDragMove,
  onDragEnd,
  gardenName,
  isDropdownOpen,
  onBack,
  onOpenDropdown,
  onWaterDragStart,
  onWaterDragEnd,
}: GardenInventoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ObjectKind>('plant');
  const isExpandedRef = useRef(isExpanded);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const panY = useRef(new Animated.Value(CLOSED_TRANSLATE_Y)).current;

  const filteredItems = useMemo(() => getEntriesByKind(activeCategory), [activeCategory]);

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

  const handleOpenDropdown = () => {
    if (isExpanded) {
      snapTo(CLOSED_TRANSLATE_Y, false);
    }
    onOpenDropdown();
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
        // Taller than the drawer itself, reserving room above it for the
        // watering can. The extra space is transparent and box-none, so it
        // neither shows nor blocks touches to the garden behind it.
        height: DRAWER_HEIGHT + CAN_RESERVE,
        paddingTop: CAN_RESERVE,
      }}
      className="absolute bottom-0 left-0 right-0 z-30"
      pointerEvents="box-none"
    >
      {/* Rendered inside the animated view so it inherits translateY and rides
          up and down with the dock, within the reserved space above it. */}
      <WateringCan
        dragX={dragX}
        dragY={dragY}
        onDragStart={onWaterDragStart}
        onDragMove={onDragMove}
        onDragEnd={onWaterDragEnd}
      />

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

        {isExpanded ? (
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
        ) : (
          <View className="w-full bg-[#46546B] border-t-2 border-[#4A4A4A] pt-2 pb-2 flex-row items-center px-4 gap-x-2">
            <Pressable onPress={onBack} className="flex-row items-center active:opacity-60">
              <MaterialCommunityIcons name="chevron-left" size={24} color="#FADBB3" />
              <Text className="font-zenmaru text-base text-[#FADBB3]">Back</Text>
            </Pressable>

            <Pressable
              onPress={handleOpenDropdown}
              className="flex-1 flex-row items-center justify-center gap-x-1 active:opacity-60"
            >
              <Text
                numberOfLines={1}
                className="font-zenmaru-bold text-lg text-[#FADBB3]"
              >
                {gardenName}
              </Text>
              <MaterialCommunityIcons
                name={isDropdownOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color="#FADBB3"
              />
            </Pressable>

            <View className="flex-row items-center gap-x-1">
              {CATEGORY_TABS.map((tab) => (
                <MaterialCommunityIcons
                  key={tab.key}
                  name={tab.icon}
                  size={18}
                  color={activeCategory === tab.key ? '#FADBB3' : '#9CA3AF'}
                />
              ))}
            </View>
          </View>
        )}
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
                onDragStart={(draggedItem: CatalogEntry, x: number, y: number) => {
                  Vibration.vibrate(50);
                  snapTo(CLOSED_TRANSLATE_Y, false);
                  onDragStart(draggedItem, x, y);
                }}
                onDragMove={onDragMove}
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
  item: CatalogEntry;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (item: CatalogEntry, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
};

function InventoryDraggable({ item, dragX, dragY, onDragStart, onDragMove, onDragEnd }: InventoryDraggableProps) {
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
      runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      runOnJS(onDragEnd)(e.absoluteX, e.absoluteY);
    });

  // Terrain tiles are cell-filling textures, so they preview edge-to-edge
  // rather than as a centred object. The eraser has no art at all.
  const isTerrain = item.kind === 'terrain';

  return (
    <GestureDetector gesture={pan}>
      <View className="flex-1 bg-[#9BB49E] border border-[#374151] rounded-2xl items-center justify-center overflow-hidden p-1">
        {item.image ? (
          <Image
            source={item.image}
            style={isTerrain
              ? { width: '100%', height: '100%' }
              : { width: '85%', height: '85%' }}
            contentFit={isTerrain ? 'cover' : 'contain'}
            cachePolicy="memory-disk"
          />
        ) : (
          <MaterialCommunityIcons name="eraser" size={28} color="#374151" />
        )}
      </View>
    </GestureDetector>
  );
}