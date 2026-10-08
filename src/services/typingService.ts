import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebaseClient';
import { TYPING_REFRESH_MS, TypingEntry } from './typingPresence';

/**
 * Typing indicators for a moment's discussion.
 *   - Signed-in users share them through Firestore: moments/{id}/typing/{uid}, written at most
 *     every TYPING_REFRESH_MS while someone types and deleted when they stop, send or leave.
 *   - Tabs of the same browser also share them over a BroadcastChannel, which keeps the feature
 *     working for local guests and in demo mode (no Firebase session, no writes).
 */
export interface Typist {
  id: string;
  name: string;
}

const CHANNEL_NAME = 'pulse-typing';
const lastSent = new Map<string, number>(); // `${momentId}:${userId}` -> time of the last write

const channel: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

interface ChannelMessage {
  momentId: string;
  userId: string;
  userName: string;
  typing: boolean;
  stamp: number;
}

const firestoreReady = () => Boolean(db && isFirebaseConfigured && auth?.currentUser);

/** The user pressed a key: tell others, refreshing at most every few seconds */
export function announceTyping(momentId: string, user: Typist) {
  const key = `${momentId}:${user.id}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < TYPING_REFRESH_MS) return;
  lastSent.set(key, now);

  channel?.postMessage({ momentId, userId: user.id, userName: user.name, typing: true, stamp: now } satisfies ChannelMessage);
  if (firestoreReady() && auth!.currentUser!.uid === user.id) {
    setDoc(doc(db!, 'moments', momentId, 'typing', user.id), {
      userId: user.id,
      userName: user.name.slice(0, 40),
      updatedAt: serverTimestamp()
    }).catch(() => lastSent.delete(key));
  }
}

/** The user stopped, sent their comment or closed the drawer */
export function stopTyping(momentId: string, user: Typist) {
  const key = `${momentId}:${user.id}`;
  if (!lastSent.has(key)) return;
  lastSent.delete(key);
  channel?.postMessage({ momentId, userId: user.id, userName: user.name, typing: false, stamp: Date.now() } satisfies ChannelMessage);
  if (firestoreReady() && auth!.currentUser!.uid === user.id) {
    deleteDoc(doc(db!, 'moments', momentId, 'typing', user.id)).catch(() => undefined);
  }
}

/**
 * Calls `onChange` with the full list of typing records whenever it changes. Returns the
 * unsubscribe function.
 */
export function subscribeTyping(momentId: string, onChange: (entries: TypingEntry[]) => void): () => void {
  const local = new Map<string, TypingEntry>();
  let remote: TypingEntry[] = [];
  const emit = () => onChange([...remote, ...local.values()]);

  const onMessage = (event: MessageEvent<ChannelMessage>) => {
    const msg = event.data;
    if (!msg || msg.momentId !== momentId) return;
    if (msg.typing) local.set(msg.userId, { userId: msg.userId, userName: msg.userName, stamp: msg.stamp });
    else local.delete(msg.userId);
    emit();
  };
  channel?.addEventListener('message', onMessage);

  let unsubscribe: Unsubscribe | null = null;
  if (db && isFirebaseConfigured) {
    try {
      unsubscribe = onSnapshot(
        collection(db, 'moments', momentId, 'typing'),
        (snapshot) => {
          remote = snapshot.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              userId: d.id,
              userName: String(data.userName || 'Someone'),
              stamp: data.updatedAt?.toMillis?.() ?? 0
            };
          });
          emit();
        },
        () => undefined // typing is a nicety: a permission or network error just hides it
      );
    } catch {
      unsubscribe = null;
    }
  }

  return () => {
    channel?.removeEventListener('message', onMessage);
    unsubscribe?.();
  };
}
