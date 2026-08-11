// import { doc, setDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
// import { db } from '../firebase';
// import { Alert } from 'react-native';

// export const setupInitialDatabase = async (
//   userId: string, 
//   userEmail: string,
//   username: string = 'ZenGardener',
//   profileImageURI: string = ''
// ) => {
//   try {
//     // 1. Updated 'users' document with Username & ProfileImageURI
//     const userRef = doc(db, 'users', userId);
//     await setDoc(userRef, {
//       AccountCreated: serverTimestamp(),
//       TotalItemsPlaced: 0,
//       Email: userEmail,
//       Username: username,
//       ProfileImageURI: profileImageURI, // Stores local URI or Firebase Storage URL
//     });

//     // 2. 'entities' document
//     const newEntityRef = doc(collection(db, 'entities'));
//     await setDoc(newEntityRef, {
//       CanGrow: true,
//       DisplayImageURI: "assets/entities/lotus_seed.png",
//       GrowthStages: [
//         { StageNumber: 1, StageImageURI: "assets/entities/lotus_sprout.png", HoursRequired: 12 },
//         { StageNumber: 2, StageImageURI: "assets/entities/lotus_bloom.png", HoursRequired: 48 }
//       ]
//     });

//     // 3. 'gardens' document
//     const newGardenRef = doc(collection(db, 'gardens'));
//     await setDoc(newGardenRef, {
//       OwnerId: userId,
//       GardenTheme: "Tranquil Water",
//       TotalEntities: 1,
//       PlacedItems: [
//         {
//           EntityId: newEntityRef.id,
//           PosX: 150,
//           PosY: 300,
//           PlantedAt: Timestamp.now(),
//           GrowthStage: 1
//         }
//       ]
//     });

//     console.log("Database collections created successfully!");
//     Alert.alert("Success", "Your updated database schema is live!");

//   } catch (error: any) {
//     console.error("Error setting up database: ", error);
//     Alert.alert("Database Error", error.message);
//   }
// };