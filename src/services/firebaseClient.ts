import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration for quizapp-project-c5e0e
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD_pX6pCrHtCu2YiPkjKIbJ1zCafVicFxA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "quizapp-project-c5e0e.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "quizapp-project-c5e0e",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "quizapp-project-c5e0e.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "489428029645",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:489428029645:web:8991f28257e3a2f83bd984",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-QWLVXQ9DBX"
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
  console.log('[PULSE Firebase] Initialized successfully with project:', firebaseConfig.projectId);
} catch (error) {
  console.warn('[PULSE Firebase] Initialization warning:', error);
  // Fallback app if already registered
  app = getApps().length > 0 ? getApp() : ({} as FirebaseApp);
}

// Configured means the SDK actually initialized, whichever project the env points at
export const isFirebaseConfigured = Boolean(db && auth);

export { app, db, auth, storage, firebaseConfig };
