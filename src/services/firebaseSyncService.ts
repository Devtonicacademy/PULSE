import {
  collection,
  collectionGroup,
  doc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  increment,
  serverTimestamp,
  getCountFromServer,
  getDoc,
  getDocs,
  deleteDoc,
  deleteField,
  updateDoc,
  runTransaction,
  Unsubscribe,
  DocumentData
} from 'firebase/firestore';
import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';
import { db, auth, isFirebaseConfigured } from './firebaseClient';
import {
  Moment,
  Comment,
  ReactionType,
  ActivityZone,
  Business,
  BusinessPost
} from '../types/pulse';

const MOMENTS_COLLECTION = 'moments';
const COMMENTS_COLLECTION = 'comments';
const USERS_COLLECTION = 'users';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';

/** Display value for authors: verified reputation isn't stored on a moment, so remote moments show a neutral one */
const REMOTE_AUTHOR_REPUTATION = 60;

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

const ZERO_REACTIONS = { helpful: 0, trending: 0, confirmed: 0, interested: 0, going: 0 };

/** Turns a Firestore moment document into the app's Moment (counters come from the server, never the client) */
export function momentFromDoc(id: string, data: DocumentData): Moment {
  const reactions = { ...ZERO_REACTIONS, ...(data.reactions || {}) };
  const commentCount = Number(data.commentCount) || 0;
  const totalReactions = Object.values(reactions).reduce<number>((sum, n) => sum + Number(n || 0), 0);
  // Engagement is derived from the counters so no client has to write a score
  const engagementScore = Math.min(100, (Number(data.engagementScore) || 50) + totalReactions * 4 + commentCount * 5);
  // Trending / confirmed reactions earn a +30 min bonus, stored as minutes on the moment
  const baseExpiry = new Date(data.expiresAt || Date.now() + 24 * 3600 * 1000).getTime();
  const expiresAt = new Date(baseExpiry + (Number(data.bonusMinutes) || 0) * 60 * 1000).toISOString();

  return {
    id,
    userId: data.userId || 'remote-user',
    userName: data.userName || 'Pulse Scout',
    userAvatar: data.userAvatar || DEFAULT_AVATAR,
    userReputation: REMOTE_AUTHOR_REPUTATION,
    title: data.title || '',
    description: data.description || '',
    category: data.category || 'events',
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    photoUrl: data.photoUrl || undefined,
    createdAt: data.createdAt || new Date().toISOString(),
    expiresAt,
    engagementScore,
    viewsCount: data.viewsCount || 1,
    isArchived: Boolean(data.isArchived),
    isBlurred: Boolean(data.isBlurred),
    approxAddress: data.approxAddress || 'Nearby Moment',
    reactions,
    commentCount,
    bonusMinutes: Number(data.bonusMinutes) || 0,
    confirmedNearby: Number(data.confirmedNearby) || 0,
    reportCount: Number(data.reportCount) || 0,
    hidden: Boolean(data.hidden)
  };
}

/**
 * Subscribes to the live moments inside `radiusKm` of a point. Each moment carries a geohash, so
 * the query only reads the few geohash ranges that cover the circle (geofire-common) and the exact
 * distance is checked here. Call the returned function to stop; call this again when the location
 * or radius changes.
 */
export function subscribeToNearbyMoments(
  center: { latitude: number; longitude: number },
  radiusKm: number,
  onMomentsUpdate: (moments: Moment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | null {
  if (!db || !isFirebaseConfigured) {
    return null;
  }

  try {
    const firestore = db;
    const centerPoint: [number, number] = [center.latitude, center.longitude];
    const bounds = geohashQueryBounds(centerPoint, radiusKm * 1000);
    const perRange = new Map<number, Moment[]>();

    const emit = () => {
      const seen = new Map<string, Moment>();
      perRange.forEach((list) => list.forEach((m) => seen.set(m.id, m)));
      onMomentsUpdate(Array.from(seen.values()));
    };

    const unsubscribers = bounds.map(([start, end], index) => {
      const q = query(
        collection(firestore, MOMENTS_COLLECTION),
        orderBy('geohash'),
        startAt(start),
        endAt(end)
      );
      return onSnapshot(
        q,
        (snapshot) => {
          perRange.set(
            index,
            snapshot.docs
              .map((docSnap) => momentFromDoc(docSnap.id, docSnap.data()))
              // Geohash ranges overshoot the circle; keep only what is really inside it
              .filter(
                (m) =>
                  Number.isFinite(m.latitude) &&
                  Number.isFinite(m.longitude) &&
                  distanceBetween([m.latitude, m.longitude], centerPoint) <= radiusKm
              )
          );
          emit();
        },
        (error) => {
          console.warn('[PULSE Firebase] Nearby moments query error:', error);
          onError?.(error);
        }
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  } catch (err: any) {
    console.warn('[PULSE Firebase] Could not subscribe to nearby moments:', err);
    onError?.(err);
    return null;
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'offline' | 'denied' | 'error' };

function failureReason(error: unknown): 'denied' | 'error' {
  return (error as { code?: string })?.code === 'permission-denied' ? 'denied' : 'error';
}

/**
 * Publishes a moment. The batch also stamps the author's last-post time: the security rules use
 * that stamp as a posting cooldown (one moment every two minutes).
 */
export async function saveMomentToFirebase(moment: Moment): Promise<SaveResult> {
  if (!db || !canWrite()) {
    return { ok: false, reason: 'offline' };
  }

  try {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    batch.set(
      doc(db, MOMENTS_COLLECTION, moment.id),
      withoutUndefined({
        id: moment.id,
        userId: moment.userId,
        userName: moment.userName,
        userAvatar: moment.userAvatar,
        title: moment.title,
        description: moment.description,
        category: moment.category,
        latitude: moment.latitude,
        longitude: moment.longitude,
        geohash: geohashForLocation([moment.latitude, moment.longitude]),
        photoUrl: moment.photoUrl,
        createdAt: moment.createdAt,
        expiresAt: moment.expiresAt,
        // Counters start at zero; the rules reject anything else
        engagementScore: 50,
        viewsCount: 1,
        isArchived: false,
        isBlurred: Boolean(moment.isBlurred),
        approxAddress: moment.approxAddress,
        reactions: { ...ZERO_REACTIONS },
        commentCount: 0,
        bonusMinutes: 0,
        confirmedNearby: 0,
        reportCount: 0,
        hidden: false,
        updatedAt: now
      })
    );
    batch.set(doc(db, USERS_COLLECTION, moment.userId), { lastPostAt: serverTimestamp() }, { merge: true });
    await batch.commit();
    console.log('[PULSE Firebase] Moment saved to Firestore:', moment.id);
    return { ok: true };
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to save moment to Firestore:', error);
    return { ok: false, reason: failureReason(error) };
  }
}

/** A reaction as stored: its type and whether the user was near the moment when confirming */
export interface StoredReaction {
  type: ReactionType;
  nearby: boolean;
}

/** About 1.5 km: the rules accept a lat/long box of 0.015 degrees, so stay a little inside it */
const NEARBY_BOX_DEGREES = 0.014;

export function isNearMoment(
  position: { latitude: number; longitude: number } | null | undefined,
  moment: { latitude: number; longitude: number }
): boolean {
  return Boolean(
    position &&
      Math.abs(position.latitude - moment.latitude) <= NEARBY_BOX_DEGREES &&
      Math.abs(position.longitude - moment.longitude) <= NEARBY_BOX_DEGREES
  );
}

/**
 * Sets, switches or removes the signed-in user's single reaction on a moment. The reaction
 * document (moments/{id}/reactions/{uid}) and the moment's counters change in one batch, and the
 * security rules check that the counters moved by exactly what the reaction document did.
 *
 * `position` is the user's GPS fix (rounded to ~100 m before it is stored); a "confirmed"
 * reaction made near the moment also counts toward "confirmed by N people nearby".
 */
export async function setMomentReaction(
  momentId: string,
  previous: StoredReaction | undefined,
  next: ReactionType | undefined,
  options: {
    currentBonusMinutes?: number;
    position?: { latitude: number; longitude: number } | null;
    moment?: { latitude: number; longitude: number };
  } = {}
): Promise<boolean> {
  const user = auth?.currentUser;
  if (!db || !canWrite() || !user || previous?.type === next) {
    return false;
  }

  try {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const reactionRef = doc(db, MOMENTS_COLLECTION, momentId, 'reactions', user.uid);
    const counters: Record<string, unknown> = { updatedAt: now };
    const nearby = next === 'confirmed' && Boolean(options.moment) && isNearMoment(options.position, options.moment!);

    if (previous) counters[`reactions.${previous.type}`] = increment(-1);
    if (next) counters[`reactions.${next}`] = increment(1);
    if (previous?.type === 'confirmed' && previous.nearby) counters.confirmedNearby = increment(-1);
    if (nearby) counters.confirmedNearby = increment(1);
    // Trending / confirmed reactions extend the moment's life by 30 minutes, up to 4 hours in total
    if ((next === 'trending' || next === 'confirmed') && (options.currentBonusMinutes ?? 0) < 240) {
      counters.bonusMinutes = increment(30);
    }

    if (next) {
      const round = (n: number) => Math.round(n * 1000) / 1000; // ~110 m
      batch.set(
        reactionRef,
        withoutUndefined({
          type: next,
          userId: user.uid,
          createdAt: now,
          updatedAt: now,
          nearby: nearby || undefined,
          lat: nearby ? round(options.position!.latitude) : undefined,
          lng: nearby ? round(options.position!.longitude) : undefined
        })
      );
    } else {
      batch.delete(reactionRef);
    }
    batch.update(doc(db, MOMENTS_COLLECTION, momentId), counters);
    await batch.commit();
    return true;
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to update reaction:', error);
    return false;
  }
}

/**
 * Streams the signed-in user's own reactions ({ momentId -> reaction }) so the UI shows what they
 * reacted to on any device. Uses a collection-group query backed by a field override in
 * firestore.indexes.json.
 */
export function subscribeToMyReactions(
  uid: string,
  onUpdate: (reactions: Map<string, StoredReaction>) => void
): Unsubscribe | null {
  if (!db || !isFirebaseConfigured) {
    return null;
  }

  try {
    const q = query(collectionGroup(db, 'reactions'), where('userId', '==', uid));
    return onSnapshot(
      q,
      (snapshot) => {
        const mine = new Map<string, StoredReaction>();
        snapshot.docs.forEach((docSnap) => {
          const momentId = docSnap.ref.parent.parent?.id;
          const data = docSnap.data();
          if (momentId) mine.set(momentId, { type: data.type as ReactionType, nearby: Boolean(data.nearby) });
        });
        onUpdate(mine);
      },
      (err) => console.warn('[PULSE Firebase] Error in reactions subscription:', err)
    );
  } catch (err) {
    console.warn('[PULSE Firebase] Could not set up reactions subscription:', err);
    return null;
  }
}

/**
 * Saves a comment. The comment counter on the moment moves in the same batch; the rules only
 * accept it together with a brand-new comment document by the same user.
 */
export async function saveCommentToFirebase(comment: Comment): Promise<boolean> {
  if (!db || !canWrite()) {
    return false;
  }

  try {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    // userLiked is per-viewer, not shared state; likes start at zero
    const { userLiked: _userLiked, ...shared } = comment;
    batch.set(
      doc(db, COMMENTS_COLLECTION, comment.id),
      withoutUndefined({ ...shared, likesCount: 0, updatedAt: now })
    );
    batch.update(doc(db, MOMENTS_COLLECTION, comment.momentId), {
      commentCount: increment(1),
      lastCommentId: comment.id,
      updatedAt: now
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to save comment:', error);
    return false;
  }
}

/**
 * Subscribes to real-time comments for a specific moment from Firestore. Likes live on each
 * comment as a `likedBy` map (uid -> true): the count is the map's size and `userLiked` is whether
 * `viewerUid` is in it. `onError` is told when the live feed is unavailable (rules, network).
 */
export function subscribeToFirebaseComments(
  momentId: string,
  viewerUid: string | null,
  onCommentsUpdate: (comments: Comment[]) => void,
  onError?: (err: Error) => void
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
          const likedBy: Record<string, unknown> = data.likedBy && typeof data.likedBy === 'object' ? data.likedBy : {};
          return {
            id: docSnap.id,
            userId: data.userId || 'scout',
            userName: data.userName || 'Pulse Scout',
            userAvatar: data.userAvatar || DEFAULT_AVATAR,
            momentId: data.momentId,
            parentId: data.parentId,
            content: data.content || '',
            createdAt: data.createdAt || new Date().toISOString(),
            likesCount: Object.keys(likedBy).length,
            userLiked: Boolean(viewerUid && likedBy[viewerUid])
          };
        });

        // Sort chronologically in memory
        liveComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        onCommentsUpdate(liveComments);
      },
      (err) => {
        console.warn('[PULSE Firebase] Error in comments subscription:', err);
        onError?.(err);
      }
    );
  } catch (err) {
    console.warn('[PULSE Firebase] Could not set up comments subscription:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}

/** Likes or unlikes a comment as the signed-in user (touches only their own entry in likedBy) */
export async function setCommentLikeInFirebase(commentId: string, liked: boolean): Promise<boolean> {
  const uid = auth?.currentUser?.uid;
  if (!db || !canWrite() || !uid) {
    return false;
  }
  try {
    await updateDoc(doc(db, COMMENTS_COLLECTION, commentId), {
      [`likedBy.${uid}`]: liked ? true : deleteField()
    });
    return true;
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to update comment like:', error);
    return false;
  }
}

/**
 * What a user has done, counted on the server. Points, reputation and badges are derived from
 * these numbers (see utils/gamification.ts) instead of being stored where a client could edit them.
 */
export interface UserActivityCounts {
  moments: number;
  reactions: number;
  comments: number;
}

export async function fetchUserActivityCounts(uid: string): Promise<UserActivityCounts | null> {
  if (!db || !isFirebaseConfigured) {
    return null;
  }

  try {
    const [moments, reactions, comments] = await Promise.all([
      getCountFromServer(query(collection(db, MOMENTS_COLLECTION), where('userId', '==', uid))),
      getCountFromServer(query(collectionGroup(db, 'reactions'), where('userId', '==', uid))),
      getCountFromServer(query(collection(db, COMMENTS_COLLECTION), where('userId', '==', uid)))
    ]);
    return {
      moments: moments.data().count,
      reactions: reactions.data().count,
      comments: comments.data().count
    };
  } catch (err) {
    console.warn('[PULSE Firebase] Could not read activity counts:', err);
    return null;
  }
}

/**
 * Subscribes to an admin-curated collection and hands back its documents. Callers keep their demo
 * seed data when the collection is empty or unreachable.
 */
function subscribeToCollection<T extends { id: string }>(
  path: string,
  onUpdate: (items: T[]) => void
): Unsubscribe | null {
  if (!db || !isFirebaseConfigured) {
    return null;
  }

  try {
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as unknown as T);
        if (items.length > 0) onUpdate(items);
      },
      (err) => console.warn(`[PULSE Firebase] Error in ${path} subscription:`, err)
    );
  } catch (err) {
    console.warn(`[PULSE Firebase] Could not set up ${path} subscription:`, err);
    return null;
  }
}

export const subscribeToActivityZones = (onUpdate: (zones: ActivityZone[]) => void) =>
  subscribeToCollection<ActivityZone>('activityZones', onUpdate);

export const subscribeToBusinesses = (onUpdate: (businesses: Business[]) => void) =>
  subscribeToCollection<Business>('businesses', onUpdate);

export const subscribeToBusinessPosts = (onUpdate: (posts: BusinessPost[]) => void) =>
  subscribeToCollection<BusinessPost>('businessPosts', onUpdate);

/** Distinct reports that hide a moment until an admin reviews it (the security rules use the same number) */
export const REPORT_HIDE_THRESHOLD = 3;

export const REPORT_REASONS = ['spam', 'harassment', 'false_information', 'dangerous_content'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportResult = { ok: true; hidden: boolean } | { ok: false; reason: 'offline' | 'guest' | 'denied' | 'error' };

/**
 * Files a report in the reports collection and bumps the moment's report counter in one
 * transaction; the third distinct report also hides the moment. Reporting needs a real
 * (non-anonymous) account, and each account can report a moment once.
 */
export async function saveReport(momentId: string, reason: string, notes?: string): Promise<ReportResult> {
  const user = auth?.currentUser;
  if (!db || !user) {
    return { ok: false, reason: 'offline' };
  }
  if (user.isAnonymous) {
    return { ok: false, reason: 'guest' };
  }
  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return { ok: false, reason: 'error' };
  }

  try {
    const firestore = db;
    const momentRef = doc(firestore, MOMENTS_COLLECTION, momentId);
    const hidden = await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(momentRef);
      if (!snap.exists()) throw new Error('moment-missing');
      const reportCount = (Number(snap.data().reportCount) || 0) + 1;
      const willHide = Boolean(snap.data().hidden) || reportCount >= REPORT_HIDE_THRESHOLD;
      tx.set(
        doc(firestore, 'reports', `${momentId}_${user.uid}`),
        withoutUndefined({
          momentId,
          reporterId: user.uid,
          reason,
          notes: notes?.trim() ? notes.trim().slice(0, 500) : undefined,
          createdAt: new Date().toISOString()
        })
      );
      tx.update(momentRef, { reportCount, hidden: willHide, updatedAt: new Date().toISOString() });
      return willHide;
    });
    return { ok: true, hidden };
  } catch (error) {
    console.warn('[PULSE Firebase] Failed to save report:', error);
    return { ok: false, reason: failureReason(error) };
  }
}

/** Whether the signed-in user is listed in the admins collection (managed by hand in the Firebase console) */
export async function checkIsAdmin(uid: string): Promise<boolean> {
  if (!db || !isFirebaseConfigured) return false;
  try {
    return (await getDoc(doc(db, 'admins', uid))).exists();
  } catch {
    return false;
  }
}

export interface ReportEntry {
  id: string;
  reporterId: string;
  reason: string;
  notes?: string;
  createdAt: string;
}

/** Admin review queue: moments hidden by reports, with a live feed */
export function subscribeToHiddenMoments(onUpdate: (moments: Moment[]) => void): Unsubscribe | null {
  if (!db || !isFirebaseConfigured) return null;
  try {
    return onSnapshot(
      query(collection(db, MOMENTS_COLLECTION), where('hidden', '==', true)),
      (snapshot) => onUpdate(snapshot.docs.map((d) => momentFromDoc(d.id, d.data()))),
      (err) => console.warn('[PULSE Firebase] Error in review queue subscription:', err)
    );
  } catch (err) {
    console.warn('[PULSE Firebase] Could not set up review queue:', err);
    return null;
  }
}

export async function fetchReportsForMoment(momentId: string): Promise<ReportEntry[]> {
  if (!db) return [];
  try {
    const snapshot = await getDocs(query(collection(db, 'reports'), where('momentId', '==', momentId)));
    return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportEntry, 'id'>) }));
  } catch (err) {
    console.warn('[PULSE Firebase] Could not read reports:', err);
    return [];
  }
}

/** Admin: put a reviewed moment back on the map (the reports stay, so the same people cannot re-hide it) */
export async function restoreMoment(momentId: string): Promise<boolean> {
  if (!db || !canWrite()) return false;
  try {
    await updateDoc(doc(db, MOMENTS_COLLECTION, momentId), {
      hidden: false,
      reportCount: 0,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.warn('[PULSE Firebase] Could not restore moment:', err);
    return false;
  }
}

/** Admin: remove a moment (and nothing else) after review */
export async function deleteMomentAsAdmin(momentId: string): Promise<boolean> {
  if (!db || !canWrite()) return false;
  try {
    await deleteDoc(doc(db, MOMENTS_COLLECTION, momentId));
    return true;
  } catch (err) {
    console.warn('[PULSE Firebase] Could not delete moment:', err);
    return false;
  }
}
