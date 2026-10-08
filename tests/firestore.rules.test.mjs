import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment,
  collectionGroup, query, where, getDocs, Timestamp
} from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'pulse-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const ZERO = { helpful: 0, trending: 0, confirmed: 0, interested: 0, going: 0 };
const momentData = (userId, over = {}) => ({
  id: 'm1', userId, userName: 'Alice', userAvatar: 'https://x/y.png', title: 'Pop-up', description: 'Details',
  category: 'events', latitude: 6.43, longitude: 3.42, geohash: 's1vgd1x', photoUrl: 'https://x/p.png',
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 864e5).toISOString(),
  engagementScore: 50, viewsCount: 1, isArchived: false, isBlurred: false, approxAddress: 'VI',
  reactions: { ...ZERO }, commentCount: 0, updatedAt: new Date().toISOString(), ...over
});

/** Seeds a moment (bypassing rules) so reaction / comment tests start from a known state */
async function seedMoment(over = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'moments/m1'), momentData('author', over));
  });
}

async function createMoment(uid, over = {}, stamp = true) {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, `moments/${over.id || 'm1'}`), momentData(uid, over));
  if (stamp) b.set(doc(d, `users/${uid}`), { lastPostAt: serverTimestamp() }, { merge: true });
  return b.commit();
}

const react = (uid, type, momentUpdate) => {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, `moments/m1/reactions/${uid}`), { type, userId: uid, createdAt: 'now', updatedAt: 'now' });
  b.update(doc(d, 'moments/m1'), momentUpdate);
  return b.commit();
};

const comment = (uid, id = 'c1', over = {}) => {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, `comments/${id}`), {
    id, userId: uid, userName: uid, userAvatar: 'a', momentId: 'm1', content: 'Nice', createdAt: 'now', likesCount: 0, ...over
  });
  b.update(doc(d, 'moments/m1'), { commentCount: increment(1), lastCommentId: id });
  return b.commit();
};

// ---- Moments: creation ---------------------------------------------------------------------

test('a signed-in user can post a moment with zeroed counters', async () => {
  await assertSucceeds(createMoment('alice'));
});

test('signed-out users cannot post', async () => {
  await assertFails(setDoc(doc(anon(), 'moments/m1'), momentData('alice')));
});

test('cannot post as someone else', async () => {
  await assertFails(createMoment('mallory', { userId: 'alice' }));
});

test('cannot post with pre-set counters or score', async () => {
  await assertFails(createMoment('alice', { reactions: { ...ZERO, trending: 99 } }));
  await assertFails(createMoment('alice', { commentCount: 40 }));
  await assertFails(createMoment('alice', { engagementScore: 100 }));
  await assertFails(createMoment('alice', { viewsCount: 5000 }));
});

test('cannot post privileged or unknown fields', async () => {
  await assertFails(createMoment('alice', { isBusiness: true }));
  await assertFails(createMoment('alice', { isVerified: true }));
  await assertFails(createMoment('alice', { userReputation: 100 }));
});

test('cannot post an invalid category or oversize text', async () => {
  await assertFails(createMoment('alice', { category: 'hacking' }));
  await assertFails(createMoment('alice', { title: 'x'.repeat(151) }));
});

test('posting needs the cooldown stamp in the same batch', async () => {
  await assertFails(createMoment('alice', {}, false));
});

test('cooldown: a second post right after the first is rejected, an old one is fine', async () => {
  await assertSucceeds(createMoment('alice'));
  await assertFails(createMoment('alice', { id: 'm2' }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), { lastPostAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000) });
  });
  await assertSucceeds(createMoment('alice', { id: 'm3' }));
});

test('cannot fake the cooldown clock with a client date', async () => {
  const d = db('alice');
  const b = writeBatch(d);
  b.set(doc(d, 'moments/m1'), momentData('alice'));
  b.set(doc(d, 'users/alice'), { lastPostAt: Timestamp.fromMillis(Date.now() - 1e9) }, { merge: true });
  await assertFails(b.commit());
});

// ---- Moments: editing and counters ------------------------------------------------------------

test('everyone can read moments, including signed-out visitors', async () => {
  await seedMoment();
  await assertSucceeds(getDoc(doc(anon(), 'moments/m1')));
});

test('the author can edit text but not their own counters', async () => {
  await seedMoment();
  await assertSucceeds(updateDoc(doc(db('author'), 'moments/m1'), { title: 'New title' }));
  await assertFails(updateDoc(doc(db('author'), 'moments/m1'), { 'reactions.trending': 500 }));
  await assertFails(updateDoc(doc(db('author'), 'moments/m1'), { engagementScore: 100 }));
  await assertFails(updateDoc(doc(db('author'), 'moments/m1'), { commentCount: 99 }));
});

test('others cannot edit text, ownership or delete', async () => {
  await seedMoment();
  await assertFails(updateDoc(doc(db('bob'), 'moments/m1'), { title: 'hijack' }));
  await assertFails(updateDoc(doc(db('bob'), 'moments/m1'), { userId: 'bob' }));
  await assertFails(deleteDoc(doc(db('bob'), 'moments/m1')));
  await assertSucceeds(deleteDoc(doc(db('author'), 'moments/m1')));
});

test('cannot bump a counter without a reaction document', async () => {
  await seedMoment();
  await assertFails(updateDoc(doc(db('bob'), 'moments/m1'), { 'reactions.helpful': increment(1) }));
  await assertFails(updateDoc(doc(db('bob'), 'moments/m1'), { engagementScore: increment(4) }));
});

// ---- Reactions ---------------------------------------------------------------------------------

test('a reaction writes its document and moves exactly one counter', async () => {
  await seedMoment();
  await assertSucceeds(react('bob', 'helpful', { 'reactions.helpful': increment(1) }));
  const snap = await getDoc(doc(db('bob'), 'moments/m1'));
  if (snap.data().reactions.helpful !== 1) throw new Error('counter not incremented');
});

test('cannot inflate a counter by more than one per reaction', async () => {
  await seedMoment();
  await assertFails(react('bob', 'helpful', { 'reactions.helpful': increment(5) }));
  await assertFails(react('bob', 'helpful', { 'reactions.helpful': increment(1), 'reactions.trending': increment(1) }));
  await assertFails(react('bob', 'helpful', { 'reactions.trending': increment(1) }));
});

test('cannot write the reaction document without the counter', async () => {
  await seedMoment();
  const d = db('bob');
  await assertFails(setDoc(doc(d, 'moments/m1/reactions/bob'), { type: 'helpful', userId: 'bob', createdAt: 'n', updatedAt: 'n' }));
});

test('cannot react on behalf of another user', async () => {
  await seedMoment();
  const d = db('mallory');
  const b = writeBatch(d);
  b.set(doc(d, 'moments/m1/reactions/bob'), { type: 'helpful', userId: 'bob', createdAt: 'n', updatedAt: 'n' });
  b.update(doc(d, 'moments/m1'), { 'reactions.helpful': increment(1) });
  await assertFails(b.commit());
});

test('one reaction per user: repeating adds nothing, switching moves the count', async () => {
  await seedMoment();
  await assertSucceeds(react('bob', 'helpful', { 'reactions.helpful': increment(1) }));
  await assertFails(react('bob', 'helpful', { 'reactions.helpful': increment(1) }));
  await assertSucceeds(react('bob', 'trending', {
    'reactions.helpful': increment(-1), 'reactions.trending': increment(1), bonusMinutes: increment(30)
  }));
  const snap = (await getDoc(doc(db('bob'), 'moments/m1'))).data();
  if (snap.reactions.helpful !== 0 || snap.reactions.trending !== 1) {
    throw new Error('counts wrong: ' + JSON.stringify(snap.reactions));
  }
});

test('a reaction can be removed, and only with the matching decrement', async () => {
  await seedMoment();
  await assertSucceeds(react('bob', 'going', { 'reactions.going': increment(1) }));
  const d = db('bob');
  const bad = writeBatch(d);
  bad.delete(doc(d, 'moments/m1/reactions/bob'));
  await assertFails(bad.commit());
  const good = writeBatch(d);
  good.delete(doc(d, 'moments/m1/reactions/bob'));
  good.update(doc(d, 'moments/m1'), { 'reactions.going': increment(-1) });
  await assertSucceeds(good.commit());
});

test('the lifespan bonus only comes with a trending / confirmed reaction, and is capped', async () => {
  await seedMoment();
  await assertFails(react('bob', 'helpful', { 'reactions.helpful': increment(1), bonusMinutes: increment(30) }));
  await assertFails(react('bob', 'trending', { 'reactions.trending': increment(1), bonusMinutes: increment(600) }));
  await assertSucceeds(react('bob', 'confirmed', { 'reactions.confirmed': increment(1), bonusMinutes: increment(30) }));
  // once the cap is reached, reacting still works without the bonus, but the bonus is refused
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'moments/m1'), momentData('author', { bonusMinutes: 240 }));
  });
  await assertSucceeds(react('carol', 'trending', { 'reactions.trending': increment(1) }));
  await assertFails(react('dave', 'trending', { 'reactions.trending': increment(1), bonusMinutes: increment(30) }));
});

test("collection-group reads only return the caller's own reactions", async () => {
  await seedMoment();
  await react('bob', 'helpful', { 'reactions.helpful': increment(1) });
  await react('carol', 'going', { 'reactions.going': increment(1) });
  const own = await assertSucceeds(
    getDocs(query(collectionGroup(db('bob'), 'reactions'), where('userId', '==', 'bob')))
  );
  if (own.size !== 1) throw new Error('expected 1, got ' + own.size);
  await assertFails(getDocs(query(collectionGroup(db('bob'), 'reactions'), where('userId', '==', 'carol'))));
  await assertFails(getDocs(query(collectionGroup(anon(), 'reactions'), where('userId', '==', 'bob'))));
});

// ---- Comments --------------------------------------------------------------------------------------

test('a comment and the comment counter go together', async () => {
  await seedMoment();
  await assertSucceeds(comment('bob'));
  const snap = (await getDoc(doc(db('bob'), 'moments/m1'))).data();
  if (snap.commentCount !== 1) throw new Error('commentCount not incremented');
});

test('cannot bump the comment counter alone, or comment without it', async () => {
  await seedMoment();
  await assertFails(updateDoc(doc(db('bob'), 'moments/m1'), { commentCount: increment(1), lastCommentId: 'ghost' }));
  await assertFails(setDoc(doc(db('bob'), 'comments/c9'), {
    id: 'c9', userId: 'bob', userName: 'b', userAvatar: 'a', momentId: 'm1', content: 'x', createdAt: 'n', likesCount: 0
  }));
});

test('cannot comment as someone else, with likes, or inflate the counter by 2', async () => {
  await seedMoment();
  await assertFails(comment('mallory', 'c2', { userId: 'bob' }));
  await assertFails(comment('bob', 'c3', { likesCount: 50 }));
  const d = db('bob');
  const b = writeBatch(d);
  b.set(doc(d, 'comments/c4'), {
    id: 'c4', userId: 'bob', userName: 'b', userAvatar: 'a', momentId: 'm1', content: 'x', createdAt: 'n', likesCount: 0
  });
  b.update(doc(d, 'moments/m1'), { commentCount: increment(2), lastCommentId: 'c4' });
  await assertFails(b.commit());
});

// ---- Typing indicators ----------------------------------------------------------------------------

const typingDoc = (uid, over = {}) => ({ userId: uid, userName: 'Bob', updatedAt: serverTimestamp(), ...over });

test('anyone can read typing indicators; only the typist writes theirs', async () => {
  await seedMoment();
  await assertSucceeds(setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('bob')));
  await assertSucceeds(getDoc(doc(db('carol'), 'moments/m1/typing/bob')));
  await assertSucceeds(getDoc(doc(anon(), 'moments/m1/typing/bob')));
  await assertSucceeds(setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('bob'))); // refresh
  await assertSucceeds(deleteDoc(doc(db('bob'), 'moments/m1/typing/bob')));
});

test('cannot fake typing for someone else, signed out, or with extra / oversize fields', async () => {
  await seedMoment();
  await assertFails(setDoc(doc(db('mallory'), 'moments/m1/typing/bob'), typingDoc('bob')));
  await assertFails(setDoc(doc(anon(), 'moments/m1/typing/bob'), typingDoc('bob')));
  await assertFails(setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('bob', { admin: true })));
  await assertFails(setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('bob', { userName: 'x'.repeat(41) })));
  await assertFails(setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('bob', { updatedAt: Timestamp.fromMillis(1) })));
  await assertFails(setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('carol')));
});

test('typing records need a real moment and cannot be deleted by others', async () => {
  await assertFails(setDoc(doc(db('bob'), 'moments/ghost/typing/bob'), typingDoc('bob')));
  await seedMoment();
  await setDoc(doc(db('bob'), 'moments/m1/typing/bob'), typingDoc('bob'));
  await assertFails(deleteDoc(doc(db('carol'), 'moments/m1/typing/bob')));
});

test('only the author can edit or delete a comment, and likesCount is closed', async () => {
  await seedMoment();
  await comment('bob');
  await assertFails(updateDoc(doc(db('carol'), 'comments/c1'), { likesCount: 100 }));
  await assertFails(updateDoc(doc(db('bob'), 'comments/c1'), { likesCount: 100 }));
  await assertSucceeds(updateDoc(doc(db('bob'), 'comments/c1'), { content: 'edited' }));
  await assertFails(deleteDoc(doc(db('carol'), 'comments/c1')));
  await assertSucceeds(deleteDoc(doc(db('bob'), 'comments/c1')));
});

// ---- Users -----------------------------------------------------------------------------------------

test('a user can read and edit their profile, but nobody else can read it', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'users/alice'), {
    id: 'alice', username: 'alice', email: 'a@x.io', avatar: 'a', bio: 'hi', isAnonymous: false
  }));
  await assertSucceeds(getDoc(doc(db('alice'), 'users/alice')));
  await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice'), { bio: 'new bio' }));
  await assertFails(getDoc(doc(db('bob'), 'users/alice')));
  await assertFails(getDoc(doc(anon(), 'users/alice')));
});

test('a user cannot edit their own points, reputation, badges or counts', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'users/alice'), { id: 'alice', username: 'alice' }));
  const forbidden = [
    { points: 99999 }, { reputation: 100 }, { badges: ['Local Legend'] },
    { createdMomentsCount: 500 }, { confirmedAlertsCount: 50 }, { isVerifiedBusiness: true }
  ];
  for (const field of forbidden) {
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), field));
  }
  await assertFails(setDoc(doc(db('alice'), 'users/alice'), { id: 'alice', username: 'a', points: 5000 }, { merge: true }));
  await assertFails(setDoc(doc(db('bob'), 'users/alice'), { id: 'alice', username: 'x' }));
});

// ---- Admin-curated collections ------------------------------------------------------------------------

test('zones, businesses and business posts are public to read and closed to clients', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'activityZones/z1'), { zoneName: 'VI' });
    await setDoc(doc(ctx.firestore(), 'businessPosts/b1'), { title: 'Sale' });
  });
  await assertSucceeds(getDoc(doc(anon(), 'activityZones/z1')));
  await assertSucceeds(getDoc(doc(anon(), 'businessPosts/b1')));
  await assertFails(setDoc(doc(db('alice'), 'activityZones/z2'), { zoneName: 'x' }));
  await assertFails(setDoc(doc(db('alice'), 'businessPosts/b2'), { title: 'x' }));
  await assertFails(updateDoc(doc(db('alice'), 'businessPosts/b1'), { title: 'x' }));
});

test('unknown collections are closed', async () => {
  await assertFails(setDoc(doc(db('alice'), 'secrets/s1'), { a: 1 }));
  await assertFails(getDoc(doc(db('alice'), 'secrets/s1')));
});
