import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebaseClient';
import { UserProfile } from '../types/pulse';
import { MOCK_USER } from './mockData';

const USERS_COLLECTION = 'users';
const LOCAL_AUTH_STORAGE_KEY = 'pulse_auth_session';

export interface AuthState {
  user: User | null;
  profile: UserProfile;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  provider: 'password' | 'google' | 'anonymous' | 'demo';
}

/**
 * Creates default UserProfile structure for an authenticated user
 */
export function buildDefaultProfile(
  uid: string,
  email?: string | null,
  displayName?: string | null,
  photoURL?: string | null,
  isAnonymous = false
): UserProfile {
  const username = displayName || (email ? email.split('@')[0] : `Scout_${uid.slice(0, 6)}`);
  const avatar =
    photoURL ||
    (isAnonymous
      ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80'
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80');

  return {
    id: uid,
    username,
    email: email || (isAnonymous ? 'guest@pulseapp.io' : `${username}@pulseapp.io`),
    avatar,
    bio: isAnonymous
      ? 'Roaming anonymous Pulse Scout exploring live city hotspots ⚡'
      : 'Active Pulse explorer discovering real-time neighborhood moments ⚡',
    reputation: isAnonymous ? 60 : 75,
    points: isAnonymous ? 50 : 150,
    badges: isAnonymous ? ['Local Scout'] : ['Local Scout', 'Trailblazer'],
    isVerifiedBusiness: false,
    createdMomentsCount: 0,
    confirmedAlertsCount: 0,
    isAnonymous,
    providerId: isAnonymous ? 'anonymous' : 'password'
  };
}

/**
 * The fields a profile document may hold. Points, reputation, badges and activity counts are
 * derived from the user's own data (see utils/gamification.ts) and the security rules reject them.
 */
function profileDocument(profile: UserProfile) {
  return Object.fromEntries(
    Object.entries({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      avatar: profile.avatar,
      bio: profile.bio,
      isAnonymous: profile.isAnonymous,
      providerId: profile.providerId,
      createdAt: profile.createdAt
    }).filter(([, value]) => value !== undefined)
  );
}

/**
 * Fetches user profile from Firestore or creates it if it doesn't exist
 */
export async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  if (!db || !isFirebaseConfigured) {
    return buildDefaultProfile(
      user.uid,
      user.email,
      user.displayName,
      user.photoURL,
      user.isAnonymous
    );
  }

  try {
    const userDocRef = doc(db, USERS_COLLECTION, user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const data = userDoc.data() as UserProfile;
      return {
        ...buildDefaultProfile(user.uid, user.email, user.displayName, user.photoURL, user.isAnonymous),
        ...data
      };
    }

    // Initialize new profile document in Firestore
    const newProfile = buildDefaultProfile(
      user.uid,
      user.email,
      user.displayName,
      user.photoURL,
      user.isAnonymous
    );
    await setDoc(userDocRef, {
      ...profileDocument(newProfile),
      createdAt: new Date().toISOString()
    });
    return newProfile;
  } catch (err) {
    console.warn('[PULSE Firebase Auth] Error fetching/saving user profile in Firestore:', err);
    return buildDefaultProfile(
      user.uid,
      user.email,
      user.displayName,
      user.photoURL,
      user.isAnonymous
    );
  }
}

/**
 * Saves updated UserProfile to Firestore
 */
export async function updateUserProfileInFirestore(profile: UserProfile): Promise<boolean> {
  // Rules only let a signed-in user write their own profile doc
  if (!db || !isFirebaseConfigured || auth?.currentUser?.uid !== profile.id) {
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(profile));
    return true;
  }

  try {
    const userDocRef = doc(db, USERS_COLLECTION, profile.id);
    await setDoc(userDocRef, profileDocument(profile), { merge: true });
    return true;
  } catch (err) {
    console.warn('[PULSE Firebase Auth] Error saving profile to Firestore:', err);
    return false;
  }
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmail(email: string, password: string): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth) {
    console.log('[PULSE Firebase Auth] Demo sign-in simulation (API key omitted).');
    await new Promise((r) => setTimeout(r, 400));
    const demoProfile: UserProfile = {
      ...MOCK_USER,
      email,
      username: email.split('@')[0],
      isAnonymous: false,
      providerId: 'password'
    };
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(demoProfile));
    return demoProfile;
  }

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return await getOrCreateUserProfile(userCredential.user);
}

/**
 * Sign up with Email, Password and optional Username
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  username?: string
): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth) {
    console.log('[PULSE Firebase Auth] Demo registration simulation (API key omitted).');
    await new Promise((r) => setTimeout(r, 400));
    const demoProfile: UserProfile = {
      ...MOCK_USER,
      id: `user-${Date.now()}`,
      email,
      username: username || email.split('@')[0],
      isAnonymous: false,
      providerId: 'password'
    };
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(demoProfile));
    return demoProfile;
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (username) {
    try {
      await updateProfile(userCredential.user, { displayName: username });
    } catch (e) {
      console.warn('[PULSE Firebase Auth] updateProfile failed:', e);
    }
  }

  const profile = await getOrCreateUserProfile(userCredential.user);
  if (username) {
    profile.username = username;
    await updateUserProfileInFirestore(profile);
  }
  return profile;
}

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle(): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth) {
    console.log('[PULSE Firebase Auth] Demo Google sign-in simulation (API key omitted).');
    await new Promise((r) => setTimeout(r, 400));
    const demoProfile: UserProfile = {
      ...MOCK_USER,
      id: 'google-demo-user',
      username: 'Google_Pulse_Scout',
      email: 'scout.google@pulseapp.io',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      isAnonymous: false,
      providerId: 'google.com'
    };
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(demoProfile));
    return demoProfile;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return await getOrCreateUserProfile(result.user);
}

/**
 * Sign in as Anonymous Guest Scout
 */
export async function signInAsGuest(): Promise<UserProfile> {
  const guestNumber = Math.floor(1000 + Math.random() * 9000);
  const fallbackGuestProfile: UserProfile = {
    id: `guest-${guestNumber}`,
    username: `Guest_Scout_${guestNumber}`,
    email: `guest_${guestNumber}@pulseapp.io`,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
    bio: 'Roaming anonymous Pulse Scout exploring live city hotspots ⚡',
    reputation: 60,
    points: 50,
    badges: ['Local Scout'],
    isVerifiedBusiness: false,
    createdMomentsCount: 0,
    confirmedAlertsCount: 0,
    isAnonymous: true,
    providerId: 'anonymous'
  };

  if (!isFirebaseConfigured || !auth) {
    console.log('[PULSE Firebase Auth] Guest sign-in session (offline/demo mode).');
    await new Promise((r) => setTimeout(r, 200));
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(fallbackGuestProfile));
    return fallbackGuestProfile;
  }

  try {
    const userCredential = await signInAnonymously(auth);
    return await getOrCreateUserProfile(userCredential.user);
  } catch (err: any) {
    console.warn(
      '[PULSE Firebase Auth] Firebase anonymous auth is disabled or restricted in Firebase Console (ADMIN_ONLY_OPERATION). Falling back to local guest scout profile so user is not blocked:',
      err
    );
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(fallbackGuestProfile));
    return fallbackGuestProfile;
  }
}

/**
 * Sign out user
 */
export async function signOutUser(): Promise<void> {
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
  }
  localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!isFirebaseConfigured || !auth) {
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  await sendPasswordResetEmail(auth, email);
}

/**
 * Subscribes to Firebase Auth state changes
 */
export function subscribeToAuthState(
  callback: (user: User | null, profile: UserProfile | null) => void
): () => void {
  if (!isFirebaseConfigured || !auth) {
    // Check local storage for demo session
    const saved = localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UserProfile;
        callback(null, parsed);
      } catch {
        callback(null, MOCK_USER);
      }
    } else {
      callback(null, MOCK_USER);
    }
    return () => {};
  }

  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const profile = await getOrCreateUserProfile(firebaseUser);
      callback(firebaseUser, profile);
    } else {
      // Check if we have a cached local demo profile
      const saved = localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
      if (saved) {
        try {
          callback(null, JSON.parse(saved));
          return;
        } catch {
          // ignore
        }
      }
      callback(null, MOCK_USER);
    }
  });

  return unsubscribe;
}

/**
 * Translates Firebase Auth error codes into friendly user messages
 */
export function formatAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const code = error.code || '';
  const message = error.message || '';

  switch (code) {
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'This sign-in provider is disabled in Firebase Console. You can sign in immediately using Email & Password, or enable Google / Anonymous under Authentication > Sign-in method in Firebase Console.';
    case 'auth/unauthorized-domain':
      return `This web domain (${typeof window !== 'undefined' ? window.location.hostname : 'current domain'}) is not authorized in Firebase. Add it in Firebase Console under Authentication > Settings > Authorized domains.`;
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No Pulse account found with this email. Please check your email or sign up.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please sign in instead.';
    case 'auth/weak-password':
      return 'Your password is too weak. Please use at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access is temporarily locked. Please try again later.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing. Please try again.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled because another popup was initiated.';
    case 'auth/network-request-failed':
      return 'Network connection issue. Please check your internet connection.';
    default:
      if (message.includes('ADMIN_ONLY_OPERATION') || message.includes('operation-not-allowed')) {
        return 'This sign-in provider is disabled in Firebase Console. You can sign in immediately with Email & Password, or enable this provider under Authentication > Sign-in method.';
      }
      if (message.includes('unauthorized-domain')) {
        return `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'current domain'}) is not authorized in Firebase Console > Authentication > Settings > Authorized domains.`;
      }
      return error.message || 'Authentication failed. Please try again.';
  }
}
