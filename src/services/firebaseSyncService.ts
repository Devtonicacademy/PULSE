import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  increment,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebaseClient';
import { Moment, Comment, ReactionType } from '../types/pulse';

const MOMENTS_COLLECTION = 'moments';
const COMMENTS_COLLECTION = 'comments';

/**
 * Security rules only accept writes from a Firebase-authenticated user. Local guest /
 * demo profiles have no Firebase session, so skip the round trip instead of failing.
 */
function canWrite(): boolean {
  return Boolean(db && isFirebaseConfigured && auth?.currentUser);
}

/**
 * Firestore rejects `undefined` field values, so drop those keys before writing
 * (e.g. a top-level comment's parentId).
 */
export function withoutUndefined<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * Subscribes to real-time moment updates from Firestore
 */
export function subscribeToFirebaseMoments(
  onMomentsUpdate: (moments: Moment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | null {
  if (!db || !isFirebaseConfigured) {
    return null;
  }

  try {
    const q = query(collection(db, MOMENTS_COLLECTION), orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveMoments: Moment[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            userId: data.userId || 'remote-user',
            userName: data.userName || 'Pulse Scout',
            userAvatar:
              data.userAvatar ||
              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
            userReputation: data.userReputation || 85,
            title: data.title || '',
            description: data.description || '',
            category: data.category || 'events',
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            photoUrl: data.photoUrl || undefined,
            createdAt: data.createdAt || new Date().toISOString(),
            expiresAt: data.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            engagementScore: data.engagementScore || 50,
            viewsCount: data.viewsCount || 1,
            isArchived: Boolean(data.isArchived),
            isBlurred: Boolean(data.isBlurred),
            approxAddress: data.approxAddress || 'Nearby Moment',
            reactions: data.reactions || { helpful: 0, trending: 0, confirmed: 0, interested: 0, going: 0 },
            commentCount: data.commentCount || 0,
            isVerified: data.isVerified,
            isBusiness: data.isBusiness,
            businessName: data.businessName
          };
        });

        if (liveMoments.length > 0) {
          onMomentsUpdate(liveMoments);
        }
      },
      (error) => {
        console.warn('[PULSE Firebase] Firestore onSnapshot error:', error);
        onError?.(error);
      }
    );
  } catch (err: any) {
    console.warn('[PULSE Firebase] Could not subscribe to moments:', err);
    onError?.(err);
    return null;
  }
}

/**
 * Saves a new live Moment to Firestore
 */
export async function saveMomentToFirebase(moment: Moment): Promise<boolean> {
  if (!db || !canWrite()) {
    return false;
  }

  try {
    const momentDocRef = doc(db, MOMENTS_COLLECTION, moment.id);
    // userReaction and distanceKm are per-viewer, not shared state
    const { userReaction: _userReaction, distanceKm: _distanceKm, ...shared } = moment;
    await setDoc(momentDocRef, {
      ...withoutUndefined(shared),
      updatedAt: new Date().toISOString()
    });
    console.log('[PULSE Firebase] Moment saved to Firestore:', moment.id);
    return true;
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to save moment to Firestore:', error);
    return false;
  }
}

/**
 * Increments reaction counts on Firestore
 */
export async function updateFirebaseReaction(
  momentId: string,
  reaction: ReactionType,
  incrementBy = 1
): Promise<boolean> {
  if (!db || !canWrite()) {
    return false;
  }

  try {
    const momentDocRef = doc(db, MOMENTS_COLLECTION, momentId);
    await updateDoc(momentDocRef, {
      [`reactions.${reaction}`]: increment(incrementBy),
      engagementScore: increment(incrementBy * 3)
    });
    return true;
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to update reaction:', error);
    return false;
  }
}

/**
 * Saves a comment to Firestore
 */
export async function saveCommentToFirebase(comment: Comment): Promise<boolean> {
  if (!db || !canWrite()) {
    return false;
  }

  try {
    const commentDocRef = doc(db, COMMENTS_COLLECTION, comment.id);
    // userLiked is per-viewer, not shared state
    const { userLiked: _userLiked, ...shared } = comment;
    await setDoc(commentDocRef, {
      ...withoutUndefined(shared),
      updatedAt: new Date().toISOString()
    });

    // Increment comment count on moment
    const momentDocRef = doc(db, MOMENTS_COLLECTION, comment.momentId);
    await updateDoc(momentDocRef, {
      commentCount: increment(1),
      engagementScore: increment(5)
    });

    return true;
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to save comment:', error);
    return false;
  }
}

/**
 * Subscribes to real-time comments for a specific moment from Firestore
 */
export function subscribeToFirebaseComments(
  momentId: string,
  onCommentsUpdate: (comments: Comment[]) => void
): Unsubscribe | null {
  if (!db || !isFirebaseConfigured) {
    return null;
  }

  try {
    const q = query(
      collection(db, COMMENTS_COLLECTION),
      where('momentId', '==', momentId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveComments: Comment[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            userId: data.userId || 'scout',
            userName: data.userName || 'Pulse Scout',
            userAvatar: data.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
            momentId: data.momentId,
            parentId: data.parentId,
            content: data.content || '',
            createdAt: data.createdAt || new Date().toISOString(),
            likesCount: data.likesCount || 0,
            userLiked: Boolean(data.userLiked)
          };
        });

        // Sort chronologically in memory
        liveComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        onCommentsUpdate(liveComments);
      },
      (err) => {
        console.warn('[PULSE Firebase] Error in comments subscription:', err);
      }
    );
  } catch (err) {
    console.warn('[PULSE Firebase] Could not set up comments subscription:', err);
    return null;
  }
}

