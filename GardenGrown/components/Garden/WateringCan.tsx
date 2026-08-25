import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { type SharedValue, runOnJS } from 'react-native-reanimated';
export const WATERING_CAN_IMAGE = require('../../assets/images/watering can.webp');

export const BUTTON_SIZE = 64;
/** Gap between the can and the dock's top edge. */
export const CAN_GAP = 8;
const RIGHT_OFFSET = 19;

/**
 * Vertical space the drawer reserves above itself for the can.
 *
 * The can renders inside the drawer so it inherits the dock's slide animation.
 * That makes `bottom` relative to the drawer's own base — 440px down, i.e. the
 * middle of the dock — so instead the drawer pads this much space above its
 * content and the can sits in it, anchored to the top.
 */
export const CAN_RESERVE = BUTTON_SIZE + CAN_GAP;

type WateringCanProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
};

/**
 * The watering can: a floating button that waters a plant when dragged onto it.
 *
 * It reuses the same drag pipeline as the inventory items — writing the finger
 * position into the shared dragX/dragY so the screen's ghost overlay can follow
 * it — but skips the long-press activation those use. Inventory tiles need it
 * to stay scrollable inside a FlatList; the can is a lone button, so waiting
 *250ms before it moves would just feel unresponsive.
 */
export default function WateringCan({ dragX, dragY, onDragStart, onDragMove, onDragEnd }: WateringCanProps) {
  const pan = Gesture.Pan()
    .onStart((e) => {
      runOnJS(onDragStart)();
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

  return (
    <View
      style={{ position: 'absolute', right: RIGHT_OFFSET, top: 0, zIndex: 20 }}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}>
          {/* Offset drop shadow, matching the buttons in the garden modal. */}
          <View
            className="absolute w-full h-full bg-[#4A4A4A] rounded-full"
            style={{ top: 2, left: 2 }}
          />
          <View className="relative w-full h-full bg-[#9BB49E] border-2 border-[#4A4A4A] rounded-full items-center justify-center">
            <Image
              source={WATERING_CAN_IMAGE}
              style={{ width: '70%', height: '70%' }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}
