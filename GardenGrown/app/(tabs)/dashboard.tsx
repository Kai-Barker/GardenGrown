import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, Pressable, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatCard from '../../components/DashboardStatCard';
import GardenCard from '../../components/DashboardGardenCard';
import { useRouter } from 'expo-router';
import { auth, db } from '../../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

// --- CAROUSEL LAYOUT METRICS ---
const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = screenWidth - 48; 
const CARD_HEIGHT = 210; 
const CARD_SPACING = 16; 
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING; 

export default function Dashboard() {
  const router = useRouter();

  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('Gardener');
  const [activeGardenIndex, setActiveGardenIndex] = useState(0);

  // Overall user stats
  const [userStats, setUserStats] = useState({
    totalGardens: 0,
    totalDecorations: 0,
    gardenedSince: 'Just now'
  });

  const [gardens, setGardens] = useState<any[]>([]);

  // --- FETCH DATA ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // 1. Fetch User Document
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        let fetchedGardenedSince = 'Just now';

        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.Username) setUsername(userData.Username);

          if (userData.AccountCreated) {
            const dateObj = userData.AccountCreated.toDate();
            fetchedGardenedSince = `${dateObj.toLocaleString('default', { month: 'short' })} ${dateObj.getFullYear()}`;
          }
        }

        // 2. Fetch ALL Gardens Belonging to the User
        const gardensRef = collection(db, 'gardens');
        const q = query(gardensRef, where('OwnerId', '==', user.uid));
        const gardensSnap = await getDocs(q);

        let fetchedTotalDecorations = 0;
        const fetchedGardens: any[] = [];

        if (!gardensSnap.empty) {
          gardensSnap.forEach((gardenDoc) => {
            const data = gardenDoc.data();

            const itemsInThisGarden = Array.isArray(data.PlacedItems) 
              ? data.PlacedItems.length 
              : (data.TotalEntities || 0);

            fetchedTotalDecorations += itemsInThisGarden;

            fetchedGardens.push({
              id: gardenDoc.id,
              ...data,
              itemCount: itemsInThisGarden
            });
          });
        }

        // 3. Update State
        setGardens(fetchedGardens);
        setUserStats({
          totalGardens: gardensSnap.size,
          totalDecorations: fetchedTotalDecorations,
          gardenedSince: fetchedGardenedSince
        });

      } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        Alert.alert("Error", "Could not load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // --- HANDLE CAROUSEL SCROLL ---
  const handleCarouselScroll = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SNAP_INTERVAL);
    if (newIndex >= 0 && newIndex < gardens.length && newIndex !== activeGardenIndex) {
      setActiveGardenIndex(newIndex);
    }
  };

  // --- LOADING UI ---
  if (loading) {
    return (
      <View className="flex-1 bg-[#EFEAE1] items-center justify-center">
        <ActivityIndicator size="large" color="#4A4A4A" />
      </View>
    );
  }

  const currentGarden = gardens.length > 0 ? gardens[activeGardenIndex] : null;
  const currentGardenItems = currentGarden?.itemCount || 0;

  return (
    <View className="flex-1 bg-[#EFEAE1]">
      {/* Texture Overlay */}
      <View pointerEvents="none" className="absolute w-full h-full z-0">
        <Image
          source={require('../../assets/textures/SandTextureVertical.webp')}
          className="w-full h-full opacity-30"
          resizeMode="cover"
        />
      </View>
      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 5,
            paddingBottom: 24
          }}
        >
          {/* MAIN COLUMN WRAPPER */}
          <View className="flex-col gap-y-3">

            {/* HEADER */}
            <View className="w-full px-6 mb-1">
              <Text className="font-zenmaru-bold text-5xl text-[#4A4A4A] mb-1 leading-tight">
                Welcome Back,
              </Text>
              <Text className="font-zenloop text-4xl text-gray-700 leading-none">
                Let's see how your gardens have grown
              </Text>
            </View>

            {/* TOP STAT CARDS */}
            <View className="w-full px-6 flex-row justify-between">
              <View className="w-[48%] h-[20vh]">
                <StatCard
                  iconName="tree"
                  heading="Total Gardens:"
                  statValue={userStats.totalGardens.toString()}
                />
              </View>
              <View className="w-[48%] h-[20vh]">
                <StatCard
                  iconName="flower-tulip"
                  heading="Total Decorations:"
                  statValue={userStats.totalDecorations.toString()}
                />
              </View>
            </View>

            {/* GARDEN CAROUSEL */}
            <View style={{ height: CARD_HEIGHT + 10 /* Added +10 due to clipping of the shadow */ }} className="w-full">
              {gardens.length > 0 ? (
                <ScrollView
                  horizontal
                  decelerationRate="fast"
                  snapToInterval={SNAP_INTERVAL}
                  snapToAlignment="start"
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={handleCarouselScroll}
                  contentContainerStyle={{
                    paddingHorizontal: 24,
                    paddingTop: 4,
                    paddingBottom: 16 // Room for the drop shadow
                  }}
                >
                  {gardens.map((garden, index) => (
                    <View 
                      key={garden.id} 
                      style={{ 
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        marginRight: index === gardens.length - 1 ? 0 : CARD_SPACING
                      }}
                    >
                      <Pressable
                        style={{ width: '100%', height: '100%' }}
                        onPress={() => {
                          router.push({
                            pathname: '/garden',
                            params: { gardenId: garden.id }
                          });
                        }}
                      >
                        <GardenCard
                          title="Current Garden"
                          gardenName={garden.GardenTheme || 'Untitled Garden'}
                          currentIndex={index}
                          totalCards={gardens.length}
                        />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={{ height: CARD_HEIGHT }} className="px-6 w-full">
                  <GardenCard
                    title="Current Garden"
                    gardenName="No Gardens Found"
                    currentIndex={0}
                    totalCards={1}
                  />
                </View>
              )}
            </View>

            {/* BOTTOM STAT CARDS */}
            <View className="w-full px-6 flex-row justify-between">
              <View className="w-[48%] h-[20vh]">
                <StatCard
                  iconName="leaf"
                  heading="Gardened Since:"
                  statValue={userStats.gardenedSince}
                />
              </View>
              <View className="w-[48%] h-[20vh]">
                <StatCard
                  iconName="sprout"
                  heading="Active Plot Items:"
                  statValue={currentGardenItems.toString()}
                />
              </View>
            </View>

          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}