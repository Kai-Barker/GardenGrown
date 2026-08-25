import { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  Image as RNImage,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AuthButton } from '../../components/AuthComponents';
import { setOnboardingComplete } from '../../services/onboarding';
import { SEED_IMAGE, SAPLING_IMAGE } from '../../components/Garden/growth';

/**
 * First-run tour. Shown automatically on a device that has never completed it
 * (the root layout decides that), and reachable any time afterwards from the
 * "How It Works" button on the splash screen.
 *
 * The art is assembled from the game's real assets rather than bespoke
 * illustrations, so the tour looks like the app it is describing — and so it
 * keeps looking right when that art is replaced.
 */

const GRASS = require('../../assets/Terrain/Grass.webp');
const SAND = require('../../assets/Terrain/Sand.webp');
const ROSE = require('../../assets/Plants/Rose.webp');
const ROCK = require('../../assets/Decorations/Rock.webp');
const WATERING_CAN = require('../../assets/images/watering can.webp');

type Slide = {
  key: string;
  kicker: string;
  title: string;
  points: string[];
  art: () => React.ReactElement;
};

/* ------------------------------------------------------------------ *
 * Slide art
 * ------------------------------------------------------------------ */

/**
 * A scaled-down DashboardStatCard. Deliberately a copy rather than an import:
 * the real card is sized to fill a grid slot and carries a 65px value row, both
 * of which are wrong at tour scale. Only the visual idiom is shared.
 */
function MiniStatCard({
  iconName,
  heading,
  statValue,
}: {
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  heading: string;
  statValue: string;
}) {
  return (
    <View className="relative w-[42%]">
      <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />
      <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl p-3">
        <MaterialCommunityIcons name={iconName} size={26} color="#A3C4A3" />
        <Text className="font-zenmaru text-[#FADBB3] text-[13px] mt-2">{heading}</Text>
        <Text numberOfLines={1} className="font-zenloop text-[#A3C4A3] text-4xl">
          {statValue}
        </Text>
      </View>
    </View>
  );
}

function DashboardArt() {
  return (
    <View className="w-full items-center">
      <View className="w-full flex-row justify-center gap-4">
        <MiniStatCard iconName="tree" heading="Total Gardens:" statValue="3" />
        <MiniStatCard iconName="flower-tulip" heading="Total Decorations:" statValue="24" />
      </View>

      {/* Stand-in for the garden carousel that sits between the two stat rows */}
      <View className="relative w-[88%] mt-5">
        <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />
        <View className="relative h-20 bg-[#A1BEA4] border-2 border-[#4A4A4A] rounded-2xl items-center justify-center">
          <Text className="font-zenloop text-[#4A4A4A] text-4xl">-- Enter Garden --</Text>
        </View>
      </View>

      <View className="flex-row mt-3">
        {[0, 1, 2].map((dot) => (
          <View
            key={dot}
            className={`h-2 w-2 rounded-full mx-1 ${dot === 0 ? 'bg-[#4A4A4A]' : 'bg-[#4A4A4A]/30'}`}
          />
        ))}
      </View>
    </View>
  );
}

/** One tile of the faux grid. `content` is the plant/decoration sitting on it. */
function GridTile({ terrain, content }: { terrain: any; content?: any }) {
  return (
    <View className="w-16 h-16 border border-[#4A4A4A]/40 items-center justify-center overflow-hidden">
      <Image source={terrain} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
      {content ? (
        <Image source={content} style={{ width: '85%', height: '85%' }} contentFit="contain" />
      ) : null}
    </View>
  );
}

function GardenArt() {
  return (
    <View className="w-full items-center">
      {/* self-center makes this wrapper shrink to the grid rather than stretch
          to the slide, and the shadow is pinned with inset + a 4px offset so it
          tracks whatever the tiles actually measure. Sizing it by hand instead
          gets the arithmetic wrong: RN borders are border-box, so tile borders
          don't add width, and w-full on the shadow would resolve against the
          full-width parent. */}
      <View className="relative self-center">
        <View className="absolute top-1 left-1 right-[-4px] bottom-[-4px] bg-[#4A4A4A] rounded-2xl" />
        <View className="relative border-2 border-[#4A4A4A] rounded-2xl overflow-hidden">
          <View className="flex-row">
            <GridTile terrain={GRASS} />
            <GridTile terrain={GRASS} content={ROSE} />
            <GridTile terrain={SAND} />
          </View>
          <View className="flex-row">
            <GridTile terrain={GRASS} content={ROCK} />
            <GridTile terrain={GRASS} />
            <GridTile terrain={SAND} />
          </View>
          <View className="flex-row">
            <GridTile terrain={GRASS} />
            <GridTile terrain={GRASS} />
            <GridTile terrain={GRASS} />
          </View>
        </View>

        {/* Drag gesture hint, floating over the empty centre cell */}
        <View className="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full bg-[#EFEAE1] border-2 border-[#4A4A4A] items-center justify-center">
          <MaterialCommunityIcons name="gesture-tap-hold" size={26} color="#4A4A4A" />
        </View>
      </View>
    </View>
  );
}

function GrowthArt() {
  return (
    <View className="w-full items-center">
      {/* The can sits above the row it acts on, as it floats above the garden */}
      {/* Sized for the same reason as the grid above — an unsized wrapper lets
          the absolute shadow stretch to the whole slide. h-16 w-16 matches the
          circle it sits behind. */}
      <View className="relative h-16 w-16 mb-4">
        <View className="absolute w-full h-full bg-[#4A4A4A] rounded-full top-1 left-1" />
        <View className="relative h-16 w-16 rounded-full bg-[#A1BEA4] border-2 border-[#4A4A4A] items-center justify-center">
          <Image source={WATERING_CAN} style={{ width: 40, height: 40 }} contentFit="contain" />
        </View>
      </View>

      <View className="flex-row items-end justify-center">
        <View className="items-center w-20">
          <Image source={SEED_IMAGE} style={{ width: 40, height: 40 }} contentFit="contain" />
          <Text className="font-zenmaru text-[#4A4A4A] text-xs mt-2">Seed</Text>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={28} color="#4A4A4A" style={{ marginBottom: 22 }} />

        <View className="items-center w-20">
          <Image source={SAPLING_IMAGE} style={{ width: 56, height: 56 }} contentFit="contain" />
          <Text className="font-zenmaru text-[#4A4A4A] text-xs mt-2">Sapling</Text>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={28} color="#4A4A4A" style={{ marginBottom: 22 }} />

        <View className="items-center w-20">
          <Image source={ROSE} style={{ width: 72, height: 72 }} contentFit="contain" />
          <Text className="font-zenmaru text-[#4A4A4A] text-xs mt-2">Grown</Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Slide content
 * ------------------------------------------------------------------ */

const SLIDES: Slide[] = [
  {
    key: 'dashboard',
    kicker: 'Welcome to your',
    title: 'Dashboard',
    points: [
      'See your total gardens and decorations at a glance.',
      'Track how long you have been gardening, and how many items are on the plot you are viewing.',
      'Swipe through your gardens, then tap one to step inside.',
    ],
    art: DashboardArt,
  },
  {
    key: 'design',
    kicker: 'Make it yours',
    title: 'Design Your Garden',
    points: [
      'Press and hold an item in the drawer, then drag it onto the grid to plant it.',
      'Paint grass, sand and water from the Terrain tab to shape the ground.',
      'Already placed? Drag it somewhere new, or down to the bottom of the screen to remove it.',
    ],
    art: GardenArt,
  },
  {
    key: 'growth',
    kicker: 'Tend and watch it',
    title: 'Water & Grow',
    points: [
      'Drag the watering can onto a plant to water it.',
      'Nothing grows until it is watered — a thirsty plant shows a blue droplet.',
      'Trees take two waterings: seed, sapling, then fully grown.',
      'Your garden keeps growing while the app is closed.',
    ],
    art: GrowthArt,
  },
];

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  /**
   * Both exits run through here. The flag is written before navigating so a
   * user who kills the app the instant the tour ends still doesn't see it again.
   */
  const finish = async () => {
    await setOnboardingComplete();
    router.replace('/(auth)/splash');
  };

  const handleNext = () => {
    if (isLast) {
      finish();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const renderSlide = ({ item }: { item: Slide }) => {
    const Art = item.art;

    return (
      <View style={{ width }} className="px-8 justify-center">
        <View className="items-center mb-10">
          <Art />
        </View>

        <Text className="font-zenloop text-[#4A4A4A] text-4.5xl text-center leading-tight">{item.kicker}</Text>
        <Text className="font-zenmaru-bold text-[#4A4A4A] text-4xl text-center mb-5">{item.title}</Text>

        {item.points.map((point) => (
          <View key={point} className="flex-row mb-3 px-1">
            <MaterialCommunityIcons
              name="leaf"
              size={18}
              color="#A3C4A3"
              style={{ marginTop: 4, marginRight: 10 }}
            />
            <Text className="font-zenmaru text-[#4A4A4A] text-base flex-1 leading-6">{point}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#EFEAE1]">
      {/* Texture Overlay (edge to edge) */}
      <View pointerEvents="none" className="absolute w-full h-full z-0">
        <RNImage
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>

      <SafeAreaView className="flex-1">
        {/* Skip — pointless on the last slide, where the primary button ends the tour */}
        <View className="h-12 px-6 items-end justify-center">
          {!isLast && (
            <Pressable onPress={finish} hitSlop={12} className="active:opacity-60">
              <Text className="font-zenmaru-bold text-[#4A4A4A] text-base">Skip</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        />

        <View className="px-8 pb-4">
          <View className="flex-row justify-center mb-5">
            {SLIDES.map((slide, i) => (
              <View
                key={slide.key}
                className={`h-2.5 rounded-full mx-1 ${
                  i === index ? 'w-6 bg-[#4A4A4A]' : 'w-2.5 bg-[#4A4A4A]/30'
                }`}
              />
            ))}
          </View>

          <AuthButton title={isLast ? 'Start Growing' : 'Next'} onPress={handleNext} />
        </View>
      </SafeAreaView>
    </View>
  );
}
