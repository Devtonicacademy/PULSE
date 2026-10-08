# ⚡ PULSE — "Never miss what's happening nearby."

<div align="center">

![Pulse Hero Banner](https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80)

**Mobile-First Hyper-Local Social Discovery Platform & Progressive Web App (PWA)**  
*The live operating system and social radar for cities.*

[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 6](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-FF4757?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Deployed on Railway](https://img.shields.io/badge/Railway-Live_Deploy-0B0D0E?logo=railway&logoColor=white)](https://pulse-production-2015.up.railway.app)
[![Firebase](https://img.shields.io/badge/Firebase-quizapp--project--c5e0e-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-5.2-243B55?logo=maplibre&logoColor=white)](https://maplibre.org/)

🌐 **Live Production App**: [https://pulse-production-2015.up.railway.app](https://pulse-production-2015.up.railway.app)

[Vision](#-core-vision) • [Map & Navigation](#-pulse-map-maplibre--openstreetmap-camera-modes--wayfinding) • [Glassmorphism & Layout](#-modern-dark-glassmorphism--consolidated-layout) • [Firebase Cloud](#-firebase-cloud--authentication-quizapp-project-c5e0e) • [PWA Features](#-progressive-web-app-pwa-features) • [Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [Directory Structure](#-directory-structure)

</div>

---

## 🌟 Core Vision

Traditional social networks are organized around friends, permanent follower graphs, or static groups. 

**PULSE is completely different.** Users are organized around:
- 📍 **Places & Geospatial Proximity**
- ⏳ **Live Moments (expiring in 24 hours)**
- 👥 **Real-Time Community Activity**
- 🎪 **Real-World Events & Pop-ups**

The product experience feels like **Google Maps + Yik Yak + Citizen + Eventbrite** engineered into a real-time social radar for local discovery.

When a user opens Pulse, they instantly know:
1. **Where people are gathering right now** (via the Radar layers (heatmap, radius, zone badges) on the Pulse Map, or the 3D extruded city).
2. **What the neighborhood pulse is** (via algorithmic **Pulse Scores** like *Victoria Island ⚡92*, *Lekki ⚡82*, *Yaba ⚡74*).
3. **What is trending near them** (via the **AI Local Radar** executive summary).
4. **What alerts, food deals, and events exist within their chosen radius** (`1km` to `25km`).
5. **How to navigate to live hotspots** with first-person street-level wayfinding guidance cues.

---

## 🗺️ Pulse Map (MapLibre + OpenStreetMap), Camera Modes & Wayfinding Navigation

One map engine, no token or key: **MapLibre GL** drawing free OpenStreetMap vector tiles from [OpenFreeMap](https://openfreemap.org) ([`src/components/map/PulseMap.tsx`](src/components/map/PulseMap.tsx), style in [`pulseMapStyle.ts`](src/components/map/pulseMapStyle.ts)). The tile and glyph URLs live in one constant (`OPENFREEMAP_TILEJSON`), so you can later point it at a self-hosted tile server with the same schema.

### 1. Dark Glass / Neon Basemap with 3D Buildings
- **Neon roads by class**: motorways and trunks glow cyan, primary and secondary roads step down through cyan-violet, minor streets stay dim.
- **3D building extrusions** (`fill-extrusion`) using OSM `height` / `levels` where it exists (OSM heights are sparse in Lagos, so most buildings use a default height); toggle them in **Layers**.
- **Readable labels**: place names, street names and points of interest.
- **Layers menu**: the Radar overlays — density heatmap, radius circle, zone badges and business offers — are off by default so the map opens clean. The same menu holds the search radius and the "Simulate Local Alert" trigger.

### 2. First-Person View (FPV Pitch) & Live Heading Tracking
- **Street-Level Immersion**: The camera swoops down to street level, elevating pitch to **72°** (at maximum physical tilt) and setting zoom to **18.2** for an authentic first-person perspective.
- **Continuous Live Heading Tracking**: The camera's bearing and focal center continuously track the user's live coordinates and device heading direction (`watchPosition` + compass orientation).
- **Smooth Cinematic Camera Transitions**:
  - **FPV (72°)**: Street-level immersive perspective locked to user movement.
  - **3D Aerial (58°)**: Panoramic skyline perspective showcasing extruded 3D architecture.
  - **2D Overview (0°)**: Tactical neighborhood overview oriented to True North.
  - **Flight Physics**: Powered by `map.flyTo` (`curve: 1.42`, `speed: 0.9`, custom cubic bezier easing) with temporary HUD toast badges indicating the active camera mode.

### 3. Street-Level Wayfinding & Game-Style Guidance Cues
- **Game-Style Waypoint Markers**: When a user selects a destination moment, Pulse renders animated floating neon chevron markers along the route at street level to guide their avatar toward the venue.
- **Dynamic Route Line**: Glowing gradient polyline connecting the user's live position to the target location.
- **Navigation HUD Card**: Displays active distance counter (`320m away`), target venue name, category badge, and 1-tap "End Route" action.
- **Pulsing Arrival Beacon**: Destination hotspot marked with a 3D animated beacon ring that pulses upon arrival.
- **Real Walking Routes**: Routes follow the OpenStreetMap street network ([`walkingRouter.ts`](src/utils/walkingRouter.ts), A* in the browser, no routing server). Outside the mapped areas they fall back to an estimated route, flagged in the HUD.

---

## 🌃 Pulse 3D (Three.js + OpenStreetMap)

The **Walk in 3D** button on the map (also in the navigation card and the sidebar) opens **Pulse 3D** ([`Pulse3DMap.tsx`](src/components/map/Pulse3DMap.tsx)), a self-hosted explore mode. It renders a night/neon city from OpenStreetMap data with the same camera modes, WASD walking, avatar, moment cards and wayfinding as the map. Three.js is loaded only when it is opened.

- **Coverage**: Victoria Island, Lekki Phase 1, Lagos Island, Yaba and Unilag. Elsewhere it shows a "no 3D data" grid.
- **Data quality**: OSM building heights are sparse in Lagos. Real heights exist for ~32% of Victoria Island buildings, almost none in Yaba/Lekki; the rest are estimated from building type and footprint.
- **Rebuilding tiles** (downloads from Overpass once, cached in `.cache/`):

```bash
node scripts/build-map-tiles.mjs
```

Output goes to [`public/map-tiles/`](public/map-tiles) (~2.3 MB, ~950 KB gzipped). Map data © OpenStreetMap contributors, ODbL.

---

## ✨ Modern Dark Glassmorphism & Consolidated Layout

Pulse features a sleek, obsidian dark theme with semi-transparent glassmorphism and a clutter-free interface designed for one-handed thumb navigation:

### 1. Glassmorphic Design Tokens ([`src/index.css`](src/index.css))
- **`.glass-sidebar`**: Translucent obsidian base (`rgba(9, 13, 23, 0.75)`), ultra-deep 24px backdrop blur, subtle luminous micro-borders (`1px solid rgba(255, 255, 255, 0.08)`), and inset lighting highlights.
- **`.glass-header`**: Streamlined mobile and tablet topbar with silky backdrop blur.
- **`.glass-bottom-bar`**: Elevated mobile dock with glowing active tab indicators.
- **`.glass-hud`**: Floating HUD action capsules with depth and drop shadows.
- **`.glass-card` & `.glass-card-interactive`**: GPU-accelerated cards with micro-glow hover states and inner rim reflections.
- **`.glass-dropdown`**: 24px blurred crystalline menus with deep obsidian contrast.

### 2. Consolidated Controls & Reduced Visible Dashboard Elements
- **Unified Camera & Layers Toolbar ([`src/components/map/PulseMap.tsx`](src/components/map/PulseMap.tsx))**:
  - A single floating row: `[ FPV | 3D Aerial | 2D Map ]  Hotspots  Walk in 3D  Layers`.
  - The `Layers` button opens one dropdown with 3D Buildings, the Radar overlays (heatmap, radius circle, zone badges, business offers), the search radius chips, the heatmap legend and the local alert simulation trigger.
- **Consolidated Discover Feed ([`src/components/feed/DiscoverFeed.tsx`](src/components/feed/DiscoverFeed.tsx))**:
  - Replaced multi-row sticky headers with a unified search field and a compact filter pill `[ ⚡ {radius}km • {sort} ▾ ]` that expands into a glass drawer only when tapped.
  - Converted the AI Local Radar summary into a compact, collapsible banner to prioritize live moments.
- **Consolidated System & Cloud Status Dock ([`src/components/profile/GamificationProfile.tsx`](src/components/profile/GamificationProfile.tsx))**:
  - Consolidated 3 separate full-width stacked status banners (PWA Install, Firebase Sync, and Guest Upgrade) into a unified, compact glass status capsule (`⚡ Firebase Live Sync • 📱 Mobile Web | Install App | Save Rank`), eliminating over 200px of scrolling clutter.
- **Consolidated App Shell Controls ([`src/components/layout/AppShell.tsx`](src/components/layout/AppShell.tsx))**:
  - **Desktop**: Segmented dual-pill controls (`[ Resident | Merchant ]`, `[ Map | Walk in 3D ]`) and compact utility icons (`Simulator`, `Install`, `Sign In`).
  - **Mobile**: Top header with location selector, score pill (`⚡ 84`), and a Quick Preferences modal (`SlidersHorizontal`) housing secondary controls off the primary viewport.

---

## 🔥 Firebase Cloud & Authentication (`quizapp-project-c5e0e`)

PULSE is integrated with Google Cloud Firebase for real-time data sync and identity management:
- **Project ID**: `quizapp-project-c5e0e`
- **Auth Domain**: `quizapp-project-c5e0e.firebaseapp.com`
- **Storage Bucket**: `quizapp-project-c5e0e.firebasestorage.app`
- **Authentication Providers**:
  - 📧 **Email & Password**: Account registration and login with client validation, password reveal toggle, and password reset flows.
  - 🌐 **Google Sign-In**: 1-click Google authentication with popup flow and auto-provisioned Scout profile.
  - ⚡ **Anonymous Guest Scout Mode**: Immediate friction-free onboarding allowing users to explore the live map and chat immediately before converting to a permanent account.
  - 🔒 **Persistent Session**: Synchronized with `onAuthStateChanged` and Firestore `users/{uid}` collection.
- **Data model** (rules in [`firestore.rules`](firestore.rules), index config in [`firestore.indexes.json`](firestore.indexes.json)):
  - `moments/{id}`: each moment stores a **geohash**. The map reads only the geohash ranges that cover the search radius (`geofire-common`) and re-queries when the location or radius changes. Counters (`reactions`, `commentCount`, `bonusMinutes`) start at zero and the rules only let them move together with the user's own reaction / comment document.
  - `moments/{id}/reactions/{uid}`: one reaction per user per moment; the user can switch or remove it (written in one batch with the counters).
  - `comments/{id}`: threaded replies; the comment counter moves in the same batch.
  - `users/{uid}`: profile only (name, avatar, bio). **Points, reputation and badges are not stored**: they are derived from the user's own activity counts, so nobody can edit them. `lastPostAt` is the posting cooldown clock (one moment every 2 minutes).
  - `activityZones`, `businesses`, `businessPosts`: read-only for clients (managed from the Firebase console); the demo seeds are used when they are empty.
- **Photos (Railway)**: the app's Node server (`server.js`, deployed on Railway) also serves a small photo API. The phone compresses the picture first (max 1600 px, WebP at 0.8, typically 50-400 kB), then `POST /api/photos` stores it in a Railway S3-compatible bucket and returns a `/photos/<uid>/<id>.webp` path that the moment keeps. The API checks the Firebase ID token (no service account needed), accepts only WebP/JPEG up to 700 kB by their real bytes, and allows 20 uploads per user per hour. Photos are served back through the same server with long-lived caching. Without the server (or while signed out) the paste-an-image-link option still works.
  - Server environment: `PHOTO_STORAGE=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_URL_STYLE` (`virtual-hosted` default, or `path`) and `FIREBASE_PROJECT_ID`. Without `PHOTO_STORAGE=s3` photos are written to `.photo-uploads/` (development only; Railway's disk is not persistent).
  - Local development: run `PORT=4000 node server.js` next to `npm run dev`; Vite proxies `/api` and `/photos` to it. Against the Auth emulator also set `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
- **Moderation**: a signed-in (non-guest) user can report a moment once; the report lands in `reports/{momentId}_{uid}` and the moment's `reportCount` moves with it. The **third distinct report hides the moment** (`hidden: true`) until a moderator reviews it; only the author still sees it. Moderators are accounts with a document in `admins/{uid}`: create it by hand in the Firebase console (Firestore > `admins` > add a document whose ID is the person's UID). They get a **Moderation queue** panel on their Profile tab with the reports behind each hidden moment and **Restore** / **Delete** buttons. Restoring resets the counter; the old reports stay, so the same people cannot re-hide it.
- **Confirmed by N people nearby**: a "Verified" reaction made with a GPS fix close to an alert (about 1.5 km, checked by the security rules) also counts toward `confirmedNearby`, shown on alerts. The fix is rounded to about 100 m and only the user can read it.
- **Alert notifications (this device only)**: from the Notifications tab the user can turn on OS notifications for new alerts inside their radius. They work while Pulse is open (a tab or the installed app), through the service worker. Real push while the app is closed needs a push server (Cloud Functions on the Blaze plan), which this project does not use.
- **Rules tests**: `npm run test:rules` runs the security rules against the Firestore emulator (needs Java 11+). `npm run emulators` starts the Firestore + Auth emulators; run the app against them with `VITE_USE_FIREBASE_EMULATOR=true npm run dev`.
- **Deploying**: nothing is deployed automatically. Before the new client works against the live project, deploy the rules and indexes (`firebase deploy --only firestore`). Moments created before the geohash field existed are not returned by nearby queries.
- **Offline / Zero-Setup Fallback**: If `VITE_FIREBASE_API_KEY` is omitted, PULSE gracefully continues operating in local reactive demo mode without network exceptions or crashes.

---

## 📱 Progressive Web App (PWA) Features

PULSE is a **fully installable Progressive Web App** configured for both mobile devices (iOS & Android) and modern desktop browsers:

### 1. Smart Installation Prompting
- **Automatic Install Banner**: Greets new users with a non-intrusive floating neon glass card highlighting native app benefits (*1-tap launch*, *Real-time proximity alerts*, *Edge-to-edge full map view*).
- **Native 1-Click Install (Android, Chrome, Edge)**: Directly hooks into the browser's `beforeinstallprompt` event.
- **Interactive iOS Safari Guide**: Because iOS Safari does not support automated prompt events, Pulse detects iOS devices and presents an intuitive 2-step graphic instruction:
  1. Tap Safari's **Share** button (`⎙`)
  2. Tap **"Add to Home Screen"** (`➕`)
- **Always Accessible**: Users can re-trigger installation anytime from the **Desktop Control Dock**, **Quick Preferences Modal**, or **Profile Status Capsule**.

### 2. Standalone App Experience
- Runs in `display: standalone` mode, removing browser URL search bars and bottom controls for a 100% native feel.
- App icons:
  - Vector icon: [`public/icon.svg`](public/icon.svg)
  - 192x192 maskable icon: [`public/icon-192.png`](public/icon-192.png)
  - 512x512 maskable icon: [`public/icon-512.png`](public/icon-512.png)
  - Apple touch icon: [`public/apple-touch-icon.png`](public/apple-touch-icon.png)
- Quick App Shortcuts built into the Web App Manifest:
  - 🗺️ *Live Map*
  - 🧭 *Discover Feed*
  - ⚡ *Broadcast Moment*

### 3. Service Worker & Offline Resiliency ([`public/sw.js`](public/sw.js))
- Pre-caches core app shell (HTML, CSS, JS, manifest, icons).
- Employs a **stale-while-revalidate** caching strategy for instant subsequent launches.
- Uses network-first caching with cached fallbacks for map tiles and media assets.

---

## 🚀 Feature Breakdown

| # | Feature | Highlights |
| :---: | :--- | :--- |
| **1** | **Pulse Map (MapLibre + OSM)** | Free OpenStreetMap vector tiles, neon roads, 3D extruded buildings, FPV street-level mode, live heading tracking, and game-style wayfinding navigation markers. No map token. |
| **2** | **Radar Layers** | Toggleable overlays on the same map (off by default): density heatmap 🔵 Low, 🟡 Medium, 🟠 High, 🔴 Trending Hotspot, radius circle, zone badges and business offers. |
| **3** | **Dynamic Radius Feed** | Instant radius selection: **1km, 2km, 5km, 10km, 25km**. Feed auto-refreshes when the user changes GPS coordinates or switches radius. |
| **4** | **Moments** | Replaces static social posts with real-world Moments across 8 categories: `🎉 Events`, `🚨 Alerts`, `🍔 Food & Drinks`, `🔍 Lost & Found`, `💡 Recommendations`, `🏃 Activities`, `🛍 Deals`, `💬 Community`. |
| **5** | **Moment Expiration** | **24-hour default lifespan** (optional 48h). High engagement grants automatic freshness extensions (+30m per surge). Expired moments cleanly move to user archives. |
| **6** | **Activity Pulse Score** | Algorithmic 0–100 score engine calculating live moment density, reaction velocity, comment volume, and views (e.g. *Victoria Island: 92*, *Lekki: 82*, *Yaba: 74*). |
| **7** | **AI Local Summary** | Executive bullet summary generated in real-time with collapsible card design ("Trending near you: Food Festival at Freedom Park, Heavy Traffic on Ozumba Mbadiwe..."). |
| **8** | **Reactions** | 5 micro-animated reactions: `👍 Helpful`, `🔥 Trending`, `✅ Confirmed`, `❤️ Interested`, `🎉 Going`. |
| **9** | **Threaded Discussions** | Multi-level comments with `@username` mentions, nested reply chains, and comment likes. |
| **10** | **Temporary Communities** | Auto-generated pop-up channels around events and campuses (*Freedom Park Tonight*, *University of Lagos Today*). Ephemeral live stream chat automatically dissolves when the moment expires. |
| **11** | **Business Accounts** | Verified golden checkmark badges. Drop **Live Pins** (`Happy Hour`, `Food Truck Location`, `Flash Sales`, `Limited Offers`) with real-time analytics (Views, Reach, Clicks, Engagement). |
| **12** | **Gamification & Badges** | Reputation score engine with level progress bar and unlockable badge shelf: `Local Scout`, `Trailblazer`, `Food Hunter`, `Community Hero`, `Safety Reporter`, `Local Legend`. |
| **13** | **Trust & Safety** | GPS proximity validation (broadcasts must originate near current location), anti-spam rate limiting, duplicate detection, and dedicated reporting modal (`Spam`, `Harassment`, `False Info`, `Danger`). |
| **14** | **Privacy by Design** | Random coordinate blurring (`±180m` jitter) protects private residential addresses while preserving neighborhood utility. |
| **15** | **Proximity Alerts** | In-app notification center and real-time floating toast alert banners with 1-click jump to map. Built-in alert test simulator. |

---

## 🏗 System Architecture

```
                                 ┌──────────────────────────────────────────────┐
                                 │               PULSE PWA Client               │
                                 │       React 18 • TypeScript • Tailwind       │
                                 └──────────────────────┬───────────────────────┘
                                                        │
          ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
          │                                             │                                             │
          ▼                                             ▼                                             ▼
┌───────────────────┐                         ┌───────────────────┐                         ┌───────────────────┐
│ Map + Pulse 3D    │                         │  PWA & Mobile UX  │                         │ State & Offline   │
│ MapLibre / Three  │                         │  (5 Core Views)   │                         │ Reactive Engine   │
├───────────────────┤                         ├───────────────────┤                         ├───────────────────┤
│• OSM 3D Buildings │                         │1. Map (Default)   │                         │• Local Storage    │
│• FPV Tracking     │                         │2. Discover Feed   │                         │• Distance Engine  │
│• Wayfinding Cues  │                         │3. Broadcast Modal │                         │• Algorithmic Score│
│• 4-Color Heatmap  │                         │4. Proximity Alerts│                         │• Service Worker   │
│• Dynamic Radius   │                         │5. Profile / Biz   │                         │• PWA Install Hook │
└─────────┬─────────┘                         └───────────────────┘                         └─────────┬─────────┘
          │                                                                                           │
          └─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                        │
                                                        ▼
                                          ┌───────────────────────────┐
                                          │    Firebase Cloud Sync    │
                                          │  Auth + Firestore NoSQL   │
                                          ├───────────────────────────┤
                                          │• Email / Google / Guest   │
                                          │• Realtime moments sync    │
                                          │• Realtime comments sync   │
                                          │• Security Rules enforced  │
                                          └───────────────────────────┘
```

---

## 💻 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher

### 1. Clone & Install
```bash
git clone https://github.com/Devtonicacademy/PULSE.git
cd PULSE
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

```env
# The map needs no token: it uses free OpenStreetMap tiles from OpenFreeMap.

# Firebase Configuration (quizapp-project-c5e0e)
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=quizapp-project-c5e0e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=quizapp-project-c5e0e
VITE_FIREBASE_STORAGE_BUCKET=quizapp-project-c5e0e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=489428029645
VITE_FIREBASE_APP_ID=1:489428029645:web:8991f28257e3a2f83bd984
VITE_FIREBASE_MEASUREMENT_ID=G-QWLVXQ9DBX
```

> [!NOTE]
> Pulse is **zero-setup ready**: if you don't provide Firebase keys, it automatically runs in interactive offline demo mode with rich pre-seeded data!

### 3. Start Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 4. Build for Production
```bash
npm run build
```
The compiled, minified production assets will be output to the `dist/` folder.

### 5. Preview Production Build
```bash
npm run preview
```

---

## 📁 Directory Structure

```
PULSE/
├── public/                       # Static public assets & PWA files
│   ├── icon.svg                  # Vector master app icon
│   ├── icon-192.png              # 192x192 maskable PWA icon
│   ├── icon-512.png              # 512x512 maskable PWA icon
│   ├── apple-touch-icon.png      # iOS home screen icon
│   ├── manifest.json             # Web App Manifest
│   └── sw.js                     # Service Worker with offline caching
├── scripts/
│   └── generate-icons.js         # Script to generate PNG icons
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthModal.tsx               # Firebase Email, Google & Guest sign-in modal
│   │   ├── business/
│   │   │   └── BusinessDashboard.tsx       # Live Pins creator & analytics
│   │   ├── comments/
│   │   │   └── MomentCommentsDrawer.tsx    # Threaded discussions & mentions
│   │   ├── communities/
│   │   │   └── TemporaryCommunitiesList.tsx# Pop-up ephemeral chat channels
│   │   ├── create/
│   │   │   └── CreateMomentModal.tsx       # 24h moment creator with privacy blurring
│   │   ├── feed/
│   │   │   └── DiscoverFeed.tsx            # Consolidated radius feed & AI local radar summary
│   │   ├── layout/
│   │   │   └── AppShell.tsx                # Glassmorphic shell, control dock & quick preferences
│   │   ├── map/
│   │   │   ├── PulseMap.tsx                # MapLibre map: camera modes, radar layers & wayfinding
│   │   │   ├── pulseMapStyle.ts            # Dark neon OSM style (OpenFreeMap tiles)
│   │   │   ├── HotspotBottomSheet.tsx      # Moment glass drawer, reactions & navigate CTA
│   │   │   └── index.ts                    # Map module exports
│   │   ├── modals/
│   │   │   └── ReportModal.tsx             # Trust & safety reporting dialog
│   │   ├── notifications/
│   │   │   └── NotificationsDrawer.tsx     # Proximity alerts & notifications
│   │   ├── profile/
│   │   │   └── GamificationProfile.tsx     # Reputation points, badges & system status dock
│   │   └── pwa/
│   │       └── PWAInstallBanner.tsx        # Smart PWA install prompt & iOS guide
│   ├── context/
│   │   └── PulseContext.tsx                # Reactive state & location tracking
│   ├── hooks/
│   │   └── usePWAInstall.ts                # PWA install prompt handler hook
│   ├── services/
│   │   ├── aiSummaryService.ts             # AI Local Radar generator
│   │   ├── firebaseAuthService.ts          # Firebase Authentication & session sync
│   │   ├── firebaseClient.ts               # Firebase App & Firestore initialization
│   │   ├── firebaseSyncService.ts          # Firestore real-time moments & reactions sync
│   │   └── mockData.ts                     # Pre-seeded hyper-local hubs
│   ├── types/
│   │   └── pulse.ts                        # TypeScript domain definitions
│   ├── utils/
│   │   └── geoUtils.ts                     # Haversine distance & privacy blur jitter
│   ├── App.tsx                             # App entry point
│   ├── index.css                           # Glassmorphic CSS design tokens & animations
│   ├── main.tsx                            # Root mount & Service Worker registration
│   └── vite-env.d.ts                       # Environment variable typings
├── .firebaserc                             # Firebase project alias (quizapp-project-c5e0e)
├── firebase.json                           # Firebase hosting and Firestore config
├── firestore.rules                         # Security rules for moments, comments, users
├── .env                                    # Environment variables
├── .env.example                            # Example environment variables template
├── index.html                              # HTML template with PWA meta tags
├── package.json                            # Dependencies & scripts
├── tailwind.config.js                      # Custom Pulse color tokens & animations
├── tsconfig.json                           # TypeScript compiler settings
└── vite.config.ts                          # Vite build configuration
```

---

## 🎨 UI Style & Design System

- **Dark Obsidian Aesthetics**: Dominant background `#070A11`, card surfaces `#0A0E17`, borders `rgba(255, 255, 255, 0.08)`.
- **Accent Signals**:
  - 💥 **Pulse Coral**: `#FF4757`
  - 📡 **Radar Cyan**: `#00F2FE`
  - ⚡ **Electric Amber**: `#FFA502`
  - 🟢 **Emerald Live**: `#10B981`
- **Glassmorphism**: `backdrop-blur-2xl` panels with luminous inset borders and translucent obsidian depths.
- **Mobile-First Responsive Layout**:
  - Phone simulator option for rapid testing of mobile hardware viewports.
  - Native 100% viewport experience on mobile touch devices.
  - Consolidated executive desktop layout with compact control docks.

---

## 🛡️ Privacy & Trust Architecture

1. **Location Blurring (±180m Jitter)**: Pulse never stores or exposes private residential coordinates. A random radial jitter is applied whenever users broadcast a moment.
2. **GPS Proximity Verification**: Broadcasters must physically be located within the vicinity of the moment to prevent remote spam.
3. **Automated Expiration**: 24-hour default lifespans prevent stale, dead posts from cluttering the city radar.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
