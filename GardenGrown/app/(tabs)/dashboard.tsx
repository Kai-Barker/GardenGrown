import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatCard from '../../components/DashboardStatCard';
import GardenCard from '../../components/DashboardGardenCard';
import { useRouter } from 'expo-router';
import { auth, db } from '../../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function Dashboard() {
  const router = useRouter();

  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('Gardener');

  // Overall user stats
  const [userStats, setUserStats] = useState({
    totalGardens: 0,
    totalDecorations: 0,
    gardenedSince: 'Just now'
  });

  // Storing as an array to allow for multiple gardens later
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

          // Format Firestore AccountCreated Timestamp to "Month Year" (e.g., "Aug 2026")
          if (userData.AccountCreated) {
            const dateObj = userData.AccountCreated.toDate();
            fetchedGardenedSince = `${dateObj.toLocaleString('default', { month: 'short' })} ${dateObj.getFullYear()}`;
          }
        }

        // 2. Fetch User's Gardens
        const gardensRef = collection(db, 'gardens');
        const q = query(gardensRef, where('OwnerId', '==', user.uid));
        const gardensSnap = await getDocs(q);

        let fetchedTotalDecorations = 0;
        const fetchedGardens: any[] = [];

        if (!gardensSnap.empty) {
          gardensSnap.forEach((gardenDoc) => {
            const data = gardenDoc.data();

            // Sum up entities across all gardens for the overall stat card
            fetchedTotalDecorations += (data.TotalEntities || 0);

            fetchedGardens.push({
              id: gardenDoc.id,
              ...data
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

  // --- LOADING UI ---
  if (loading) {
    return (
      <View className="flex-1 bg-[#EFEAE1] items-center justify-center">
        <ActivityIndicator size="large" color="#4A4A4A" />
      </View>
    );
  }

  // TODO: ADD CAROUSEL FOR MORE GARDENS - STORE FIRST GARDEN FOR NOW
  const currentGarden = gardens.length > 0 ? gardens[0] : null;
  const currentGardenTheme = currentGarden?.GardenTheme || 'Empty Plot';
  const currentGardenItems = currentGarden?.TotalEntities || 0;

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
            paddingHorizontal: 24,
            paddingTop: 5
          }}
        >
          <View className="flex-row flex-wrap justify-between gap-y-3">

            {/* HEADER */}
            <View className="w-full mb-2">
              <Text className="font-zenmaru-bold text-5xl text-[#4A4A4A] mb-1 leading-tight">
                Welcome Back
              </Text>
              <Text className="font-zenloop text-4xl text-gray-700 leading-none">
                Lets see how your garden has grown
              </Text>
            </View>

            {/* TOP STAT CARDS (Overall Data) */}
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
                heading="Total Decorations"
                statValue={userStats.totalDecorations.toString()}
              />
            </View>

            {/* GARDEN CARD */}
            <View className="w-full h-[25vh] my-1">
              <Pressable onPress={() => router.push('/garden')}>
                <GardenCard
                  title="Current Garden"
                  gardenName={currentGardenTheme}
                  currentIndex={0}
                  totalCards={userStats.totalGardens > 0 ? userStats.totalGardens : 1}
                  onPressEnter={() => console.log('Entering garden...')}
                />
              </Pressable>
            </View>

            {/* BOTTOM STAT CARDS (Contextual to User & Current Garden) */}
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
                heading="Items Placed:"
                statValue={currentGardenItems.toString()}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}