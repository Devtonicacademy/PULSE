import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration for quizapp-project-c5e0e
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD_pX6pCrHtCu2YiPkjKIbJ1zCafVicFxA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "quizapp-project-c5e0e.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quizapp-project-c5e0e",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "quizapp-project-c5e0e.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "489428029645",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:489428029645:web:8991f28257e3a2f83bd984",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-QWLVXQ9DBX"
};

let app: FirebaseApp;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  // Local development against the Firebase emulators (npm run emulators): set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true (VITE_USE_FIREBASE_EMULATOR also works)
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && getApps().length === 1) {
    try {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      console.log('[PULSE Firebase] Using the local emulators (Firestore 8080, Auth 9099)');
    } catch {
      // Already connected (hot reload)
    }
  }
  console.log('[PULSE Firebase] Initialized successfully with project:', firebaseConfig.projectId);
} catch (error) {
  console.warn('[PULSE Firebase] Initialization warning:', error);
  // Fallback app if already registered
  app = getApps().length > 0 ? getApp() : ({} as FirebaseApp);
}

// Configured means the SDK actually initialized, whichever project the env points at
export const isFirebaseConfigured = Boolean(db && auth);

export { app, db, auth, storage, firebaseConfig };
