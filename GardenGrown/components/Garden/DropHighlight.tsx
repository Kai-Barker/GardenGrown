import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { CELL_SIZE } from './constants';

/** The app's green for a drop that'll do something, its red for one that won't. */
const VALID_COLOR = '#9BB49E';
const INVALID_COLOR = '#D9534F';

const PULSE_MS = 700;
/** Circle diameter as a fraction of the cell. */
const CIRCLE_SCALE = 0.8;

type DropHighlightProps = {
  col: number;
  row: number;
  /** Whether releasing here would actually do anything. */
  valid: boolean;
};

/**
 * Pulsing circle marking the cell a drag would land on.
 *
 * Mounted only while a drag is over the grid, so the pulse loop needs no
 * explicit teardown — unmounting stops it. Must render before the placed
 * objects so items still draw on top of it.
 */
function DropHighlight({ col, row, valid }: DropHighlightProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    // -1 repeats forever; `true` reverses each cycle for a breathing pulse
    // rather than a sawtooth restart.
    scale.value = withRepeat(withTiming(1.15, { duration: PULSE_MS }), -1, true);
    opacity.value = withRepeat(withTiming(0.25, { duration: PULSE_MS }), -1, true);
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const diameter = CELL_SIZE * CIRCLE_SCALE;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: col * CELL_SIZE + (CELL_SIZE - diameter) / 2,
          top: row * CELL_SIZE + (CELL_SIZE - diameter) / 2,
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderWidth: 2,
          borderColor: valid ? VALID_COLOR : INVALID_COLOR,
          backgroundColor: valid ? `${VALID_COLOR}55` : `${INVALID_COLOR}55`,
        },
        animatedStyle,
      ]}
    />
  );
}

export default React.memo(DropHighlight);
