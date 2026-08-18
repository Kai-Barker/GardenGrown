# Kai Barker – Garden Grown

<!-- Add a banner image here, e.g.:
<img width="1280" height="480" alt="GardenGrownBanner" src="" />
-->

## Table of Contents

1. [About the Project](#1-about-the-project)
   - 1.1 [Project Description](#11-project-description)
   - 1.2 [Built With](#12-built-with)
2. [Getting Started](#2-getting-started)
   - 2.1 [Prerequisites](#21-prerequisites)
   - 2.2 [How to Install](#22-how-to-install)
3. [Features and Usage](#3-features-and-usage)
   - [Screenshots & Explanations](#screenshots--explanations)
4. [Demonstration Video](#4-demonstration-video)
5. [Architecture / System Design](#5-architecture--system-design)
6. [Highlights and Challenges](#6-highlights-and-challenges)
7. [Roadmap – Future Improvements](#7-roadmap--future-improvements)
8. [Contributing and License](#8-contributing-and-license)
9. [Authors and Contact Info](#9-authors-and-contact-info)
10. [Acknowledgements](#10-acknowledgements)

---

## 1. About the Project

### 1.1 Project Description

**Garden Grown** is a mobile stress-reduction app built around one simple idea: *grow at your own pace*. Rather than guided meditations or breathing exercises that demand active focus, Garden Grown offers a passive, creative outlet — a digital zen garden the user can arrange and rearrange however they like.

The entire experience is built around a single constraint: **one hand only**. Every interaction is designed to be comfortable to perform with a thumb, so users can unwind in a relaxed posture — on the couch, in bed, or with a drink in the other hand — without needing to give the app their full attention. There are no timers, no scores, and no fail states (no plants can die); the only goal is a satisfying, rhythmic drag-and-drop experience.

Users can create an account, build and customise a garden on a grid by dragging elements (plants, decorations, terrain) into place, and have their layout saved and persisted so they can return to it at any time.

### 1.2 Built With

#### Frontend
![React Native](https://img.shields.io/badge/-React%20Native-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![NativeWind](https://img.shields.io/badge/-NativeWind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Reanimated](https://img.shields.io/badge/-React%20Native%20Reanimated-black?style=for-the-badge&logo=react&logoColor=61DAFB)

#### Backend / Services
![Firebase](https://img.shields.io/badge/-Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Firebase Auth](https://img.shields.io/badge/-Firebase%20Auth-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Firestore](https://img.shields.io/badge/-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)

---

## 2. Getting Started

### 2.1 Prerequisites

- Node.js (v18 or newer)
- npm
- A Firebase project (Auth + Firestore enabled)
- Expo CLI / React Native tooling (Android Studio or Xcode for emulators, or the Expo Go app for a physical device)
- Git

### 2.2 How to Install

1. **Clone the Repository**

```bash
git clone https://github.com/Kai-Barker/GardenGrown.git
cd GardenGrown/GardenGrown
```

2. **Install Dependencies**

```bash
npm install
```

3. **Configure Firebase**

Create a `.env` file in the project root with your Firebase project's config:

```bash
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

4. **Run the App**

```bash
npx expo start
```

Then scan the QR code with Expo Go, or launch an Android/iOS emulator from the terminal menu.

---

## 3. Features and Usage

- **One-Handed by Design**: Every pressable element is large, thumb-reachable, and sits in the bottom half of the screen to keep the whole experience comfortable to use with a single hand.
- **Drag & Drop Garden Building**: The core mechanic — drag plants, decorations, and terrain from a bottom inventory dock and drop them onto a snapping grid.
- **No Fail States**: No timers, scores, streaks, or dying plants. Nothing to lose, nothing to optimise — just arranging.
- **Persistent Gardens**: Garden layouts are saved to Firestore so users can leave and pick up exactly where they left off.
- **Firebase Authentication**: Secure registration, login, and session management.
- **Dashboard**: An overview of the user's garden(s), including stats like total decorations placed and how long they've been gardening.
- **Rounded, Calming UI**: Soft, rounded UI elements and a muted colour palette chosen specifically to feel relaxing rather than gamified.

### Screenshots & Explanations

**Splash / Log In / Sign Up**

- Entry point into the app, with minimal-typing forms to keep the one-handed constraint intact.
<!-- ![](./documentation/documentation_assets/Splash.png) -->
<!-- ![](./documentation/documentation_assets/LogIn.png) -->
<!-- ![](./documentation/documentation_assets/SignUp.png) -->

**Dashboard**

- Shows the user's garden(s) at a glance, along with total decorations placed and how long they've been gardening.
<!-- ![](./documentation/documentation_assets/Dashboard.png) -->

**Garden**

- The core drag-and-drop experience — elements snap onto a grid, with the inventory dock tucked away at the bottom to maximise workspace.
<!-- ![](./documentation/documentation_assets/Garden.png) -->
<!-- ![](./documentation/documentation_assets/GardenInventoryOpen.png) -->

**Profile**

- Displays the user's account details and gardening stats.
<!-- ![](./documentation/documentation_assets/Profile.png) -->

---

## 4. Demonstration Video

[🔗 Watch Here](#)

---

## 5. Architecture / System Design

- **Frontend**:
  - **Responsibility**: Renders the UI, manages the drag-and-drop garden state, and handles all user interactions.
  - **Framework**: React Native (with TypeScript), styled using NativeWind, animated using React Native Reanimated.
- **Backend / Services**:
  - **Firebase Auth**: Handles user registration, login, and secure session management.
  - **Firebase Firestore**: A NoSQL database storing user profile data and saved garden layouts, and handling all CRUD functionality for gardens and placed entities.

#### System Diagrams

<!-- ![Entity Relationship Diagram](./documentation/documentation_assets/GardenGrown%20ER%20Diagram.png) -->
<!-- ![User Flow Diagram](./documentation/documentation_assets/GardenGrown%20User%20Flow.png) -->

---

## 6. Highlights and Challenges

### Highlights

- Designing an entire app around a single, strict constraint (one hand only) and having it shape every UI decision.
- Building a smooth, satisfying drag-and-drop grid system.
- Removing all conventional "engagement" mechanics (streaks, scores, fail states) in favour of a genuinely stress-free experience.
- Working with Firebase/Firestore for authentication and persistent, structured garden data.

### Challenges

- Keeping the garden grid visually consistent across different device sizes while using a fixed row/column count.
- Handling drag-and-drop placement smoothly alongside asynchronous saves to Firestore, including planning for unstable network conditions.
- Structuring Firestore's NoSQL collections (Users, Entities, Gardens) to cleanly support growth stages and placed items without over-nesting data.

---

## 7. Roadmap – Future Improvements

- Smarter elements that track their own growth stage
- A rake tool to add patterns into sand patches
- Watering plants to help them grow faster
- Mimicking real-life events such as rain, via an external API
- Social features to visit other users' gardens
- Unlockable seasonal element sets (e.g. autumn-themed plants)
- Visual themes (e.g. Night mode)

---

## 8. Contributing and License

Any contributions to this project are **greatly appreciated!** To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Open a pull request

### License

Distributed under the MIT License.

---

## 9. Authors

- Kai Barker – Developer and Designer – [Kai-Barker](https://github.com/Kai-Barker)

Feel free to reach out for questions, feedback, or collaboration opportunities.

## Contact Info

- Kai Barker – [241065@virtualwindow.co.za](mailto:241065@virtualwindow.co.za)
- Kai Barker – [kaieddiebarker@gmail.com](mailto:kaieddiebarker@gmail.com)

---

## 10. Acknowledgements

- [Tsungai Katsuro](https://github.com/TsungaiKats)
- Firebase
- Gemini
- Claude
- [Saironwen](https://www.artstation.com/saironwen) for the [flower assets](https://saironwen.itch.io/flowers-png)
