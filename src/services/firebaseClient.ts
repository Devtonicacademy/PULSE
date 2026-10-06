import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration for quizapp-project-c5e0e
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyQuizAppKeyFallbackPlaceholder',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'quizapp-project-c5e0e.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'quizapp-project-c5e0e',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'quizapp-project-c5e0e.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1029384756',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1029384756:web:quizappproject'
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

export const isFirebaseConfigured = Boolean(
  firebaseConfig.projectId === 'quizapp-project-c5e0e' &&
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_API_KEY.trim().length > 0
);

export { app, db, auth, storage, firebaseConfig };
