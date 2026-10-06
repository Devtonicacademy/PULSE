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
[![Firebase](https://img.shields.io/badge/Firebase-quizapp--project--c5e0e-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostGIS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Mapbox GL](https://img.shields.io/badge/Mapbox_GL-Standard_3D-4264FB?logo=mapbox&logoColor=white)](https://mapbox.com/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-5.2-243B55?logo=maplibre&logoColor=white)](https://maplibre.org/)

[Features](#-feature-breakdown) • [PWA Installation](#-progressive-web-app-pwa-features) • [Firebase Cloud](#-firebase--cloud-sync) • [Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [Directory Structure](#-directory-structure)

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
1. **Where people are gathering right now** (via the Live Activity Heatmap).
2. **What the neighborhood pulse is** (via algorithmic **Pulse Scores** like *Victoria Island ⚡92*, *Lekki ⚡82*, *Yaba ⚡74*).
3. **What is trending near them** (via the **AI Local Radar** executive summary).
4. **What alerts, food deals, and events exist within their chosen radius** (`1km` to `25km`).

---

## 📱 Progressive Web App (PWA) Features

PULSE is a **fully installable Progressive Web App** configured for both mobile devices (iOS & Android) and modern desktop browsers:

### 1. Smart Installation Prompting
- **Automatic Install Banner**: Greets new users with a non-intrusive floating neon glass card highlighting the native app benefits (*1-tap launch*, *Real-time proximity alerts*, *Edge-to-edge full map view*).
- **Native 1-Click Install (Android, Chrome, Edge)**: Directly hooks into the browser's `beforeinstallprompt` event.
- **Interactive iOS Safari Guide**: Because iOS Safari does not support automated prompt events, Pulse automatically detects iOS devices and presents an intuitive 2-step graphic instruction:
  1. Tap Safari's **Share** button (`⎙`)
  2. Tap **"Add to Home Screen"** (`➕`)
- **Always Accessible**: If dismissed, users can re-trigger installation anytime from the **Header Install Button** or the **Profile PWA Card**.

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

## 🔥 Firebase Cloud & Authentication (`quizapp-project-c5e0e`)

PULSE is integrated with Google Cloud Firebase for real-time data sync and identity management:
- **Project ID**: `quizapp-project-c5e0e`
- **Auth Domain**: `quizapp-project-c5e0e.firebaseapp.com`
- **Storage Bucket**: `quizapp-project-c5e0e.firebasestorage.app`
- **Authentication Providers**:
  - 📧 **Email & Password**: Smooth account creation and login with client validation, password reveal toggle, and password reset flows.
  - 🌐 **Google Sign-In**: 1-click Google authentication with popup flow and auto-provisioned Scout profile.
  - ⚡ **Anonymous Guest Scout Mode**: Immediate friction-free onboarding allowing users to explore the live map and chat immediately before converting to a permanent account.
  - 🔒 **Persistent Session**: Synchronized with `onAuthStateChanged` and Firestore `users/{uid}` collection.
- **Real-Time Collections**:
  - `moments`: Synchronizes live moments, geographic coordinates, privacy blur flags, and expiration timestamps.
  - `comments`: Real-time threaded replies and discussion counters.
  - `reactions`: Real-time increments for helpful, trending, and confirmed activity counts.
  - `users`: User profile badges, reputation scores, and scout bios.
- **Offline / Zero-Setup Fallback**: If `VITE_FIREBASE_API_KEY` is omitted, PULSE gracefully continues operating in local reactive demo mode without network exceptions or crashes.

---

## 🚀 Feature Breakdown

| # | Feature | Highlights |
| :---: | :--- | :--- |
| **1** | **Live Activity Map** | The default homepage. MapLibre GL hardware-accelerated dark map with dynamic Heatmap layer: <br>🔵 **Blue**: Low Activity • 🟡 **Yellow**: Medium • 🟠 **Orange**: High • 🔴 **Red**: Trending Hotspot.<br>Interactive pins, cluster badges, and hotspot zones. |
| **2** | **Dynamic Radius Feed** | Instant radius selection chips: **1km, 2km, 5km, 10km, 25km**. Feed auto-refreshes when the user changes GPS coordinates or switches radius. |
| **3** | **Moments** | Replaces static social posts with real-world Moments across 8 categories: `🎉 Events`, `🚨 Alerts`, `🍔 Food & Drinks`, `🔍 Lost & Found`, `💡 Recommendations`, `🏃 Activities`, `🛍 Deals`, `💬 Community`. |
| **4** | **Moment Expiration** | **24-hour default lifespan** (optional 48h). High engagement grants automatic freshness extensions (+30m per surge). Expired moments cleanly move to user archives. |
| **5** | **Activity Pulse Score** | Algorithmic 0–100 score engine calculating live moment density, reaction velocity, comment volume, and views (e.g. *Victoria Island: 92*, *Lekki: 82*, *Yaba: 74*). |
| **6** | **AI Local Summary** | Executive bullet summary generated in real-time ("Trending near you: Food Festival at Freedom Park, Heavy Traffic on Ozumba Mbadiwe, Coffee Shop Grand Opening..."). |
| **7** | **Reactions** | 5 micro-animated reactions: `👍 Helpful`, `🔥 Trending`, `✅ Confirmed`, `❤️ Interested`, `🎉 Going`. |
| **8** | **Threaded Discussions** | Multi-level comments with `@username` mentions, nested reply chains, and comment likes. |
| **9** | **Temporary Communities** | Auto-generated pop-up channels around events and campuses (*Freedom Park Tonight*, *University of Lagos Today*). Ephemeral live stream chat automatically dissolves when the moment expires. |
| **10** | **Business Accounts** | Verified golden checkmark badges. Drop **Live Pins** (`Happy Hour`, `Food Truck Location`, `Flash Sales`, `Limited Offers`) with real-time analytics (Views, Reach, Clicks, Engagement). |
| **11** | **Gamification & Badges** | Reputation score engine with level progress bar and unlockable badge shelf: `Local Scout`, `Trailblazer`, `Food Hunter`, `Community Hero`, `Safety Reporter`, `Local Legend`. |
| **12** | **Trust & Safety** | GPS proximity validation (broadcasts must originate near current location), anti-spam rate limiting, duplicate detection, and dedicated reporting modal (`Spam`, `Harassment`, `False Info`, `Danger`). |
| **13** | **Privacy by Design** | Random coordinate blurring (`±180m` jitter) protects private residential addresses while preserving neighborhood utility. |
| **14** | **Proximity Alerts** | In-app notification center and real-time floating toast alert banners with 1-click jump to map. Built-in alert test simulator. |

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
│   Map Engine      │                         │  PWA & Mobile UX  │                         │ State & Offline   │
│  (MapLibre GL)    │                         │  (5 Core Views)   │                         │ Reactive Engine   │
├───────────────────┤                         ├───────────────────┤                         ├───────────────────┤
│• 4-Color Heatmap  │                         │1. Map (Default)   │                         │• Local Storage    │
│• Dynamic Radius   │                         │2. Discover Feed   │                         │• Distance Engine  │
│• Category Pins    │                         │3. Broadcast Modal │                         │• Algorithmic Score│
│• Hotspot Badges   │                         │4. Proximity Alerts│                         │• Service Worker   │
│• Glass Drawer     │                         │5. Profile / Biz   │                         │• PWA Install Hook │
└───────────────────┘                         └───────────────────┘                         └─────────┬─────────┘
                                                                                                      │
                                                        ┌─────────────────────────────────────────────┘
                                                        ▼
                                          ┌───────────────────────────┐
                                          │     Supabase Backend      │
                                          │   PostgreSQL + PostGIS    │
                                          ├───────────────────────────┤
                                          │• ST_DWithin Radius Query  │
                                          │• Spatial Point Indexing   │
                                          │• Realtime Channels        │
                                          │• Row Level Security (RLS) │
                                          └───────────────────────────┘
```

---

## 💻 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher

### 1. Clone & Install
```bash
git clone https://github.com/your-username/pulse.git
cd pulse
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

```env
# Supabase Configuration (Optional - falls back to offline reactive demo mode if omitted)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Mapbox Access Token (Optional - falls back to MapLibre GL CartoDB Dark Matter if omitted)
VITE_MAPBOX_TOKEN=
```

> [!NOTE]
> Pulse is **zero-setup ready**: if you don't provide Supabase or Mapbox keys, it runs out of the box in interactive offline demo mode with rich pre-seeded data!

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

## 🗄 Database Schema & PostGIS

Pulse is built for **PostgreSQL 15+** with the **PostGIS** spatial extension. The complete SQL DDL migration is provided in:

📂 [`supabase/migrations/20261006_init_pulse_schema.sql`](supabase/migrations/20261006_init_pulse_schema.sql)

### Core Database Tables:
- **`users`**: User identity, avatar, bio, reputation score, and earned badge arrays.
- **`moments`**: Core broadcast units with `GEOGRAPHY(Point, 4326)` coordinates, category enums, 24h expiration timestamp, and privacy blurring flag.
- **`reactions`**: Real-time reaction records (`helpful`, `trending`, `confirmed`, `interested`, `going`) with unique compound keys.
- **`comments`**: Multi-level threaded discussions with parent references and author metadata.
- **`businesses`**: Business profiles, verification status, categories, and subscription tiers.
- **`business_posts`**: Live Pins (`Happy Hour`, `Flash Sale`, `Food Truck`, `Limited Offer`) with engagement metrics.
- **`activity_zones`**: High-density zones with dynamic Pulse Scores (e.g. Victoria Island, Lekki, Yaba).
- **`temporary_communities`**: Pop-up ephemeral groups linked to events with auto-expiration timestamps.
- **`reports`**: Community moderation queue for trust & safety reports.

### Spatial Query Example:
```sql
-- Query active Moments within user's dynamic radius using PostGIS ST_DWithin
SELECT 
  id, title, category, latitude, longitude, photo_url,
  ST_Distance(geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distance_meters
FROM moments
WHERE is_archived = FALSE
  AND expires_at > NOW()
  AND ST_DWithin(
    geom,
    ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
    5000 -- 5km radius
  )
ORDER BY engagement_score DESC, created_at DESC;
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
│   │   │   └── DiscoverFeed.tsx            # Radius feed & AI local radar summary
│   │   ├── layout/
│   │   │   └── AppShell.tsx                # Bottom nav, header, mobile frame toggle
│   │   ├── map/
│   │   │   ├── LiveActivityMap.tsx         # Heatmap canvas & interactive markers
│   │   │   └── HotspotBottomSheet.tsx      # Moment glass drawer & reactions
│   │   ├── modals/
│   │   │   └── ReportModal.tsx             # Trust & safety reporting dialog
│   │   ├── notifications/
│   │   │   └── NotificationsDrawer.tsx     # Proximity alerts & notifications
│   │   ├── profile/
│   │   │   └── GamificationProfile.tsx     # Reputation points & badge shelf
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
│   │   ├── mockData.ts                     # Pre-seeded hyper-local hubs
│   │   └── supabaseClient.ts               # Supabase client connector
│   ├── types/
│   │   └── pulse.ts                        # TypeScript domain definitions
│   ├── utils/
│   │   └── geoUtils.ts                     # Haversine distance & privacy blur jitter
│   ├── App.tsx                             # App entry point
│   ├── index.css                           # Tailwind CSS & glass styling
│   ├── main.tsx                            # Root mount & Service Worker registration
│   └── vite-env.d.ts                       # Environment variable typings
├── .firebaserc                             # Firebase project alias (quizapp-project-c5e0e)
├── firebase.json                           # Firebase hosting and Firestore config
├── firestore.rules                         # Security rules for moments, comments, users
├── supabase/
│   └── migrations/
│       └── 20261006_init_pulse_schema.sql  # PostGIS schema migration
├── .env                                    # Environment variables (Mapbox, Firebase, Supabase)
├── .env.example                            # Example environment variables template
├── index.html                              # HTML template with PWA meta tags
├── package.json                            # Dependencies & scripts
├── tailwind.config.js                      # Custom Pulse color tokens & animations
├── tsconfig.json                           # TypeScript compiler settings
└── vite.config.ts                          # Vite build configuration
```

---

## 🎨 UI Style & Design System

- **Dark Obsidian Aesthetics**: Dominant background `#0A0E17`, card surfaces `#121927`.
- **Accent Signals**:
  - 💥 **Pulse Coral**: `#FF4757`
  - 📡 **Radar Cyan**: `#00F2FE`
  - ⚡ **Electric Amber**: `#FFA502`
  - 🟢 **Emerald Live**: `#10B981`
- **Glassmorphism**: `backdrop-blur-md` panels with delicate `rgba(255, 255, 255, 0.08)` borders.
- **Mobile-First Responsive Layout**:
  - Displays inside a smartphone frame on desktop with notch/dynamic island styling.
  - One-click toggle in top bar to switch to Expanded Full-Width Web View.
  - Native 100% viewport experience on mobile touch devices.

---

## 🛡️ Privacy & Trust Architecture

1. **Location Blurring (±180m Jitter)**: Pulse never stores or exposes private residential coordinates. A random radial jitter is applied whenever users broadcast a moment.
2. **GPS Proximity Verification**: Broadcasters must physically be located within the vicinity of the moment to prevent remote spam.
3. **Automated Expiration**: 24-hour default lifespans prevent stale, dead posts from cluttering the city radar.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
