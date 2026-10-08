// Phase 3 rules: photo URLs, "confirmed by people nearby", reports with auto-hide, admins
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

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
const real = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const guest = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const UUID = '0123abcd-0123-4abc-8abc-0123456789ab';

const ZERO = { helpful: 0, trending: 0, confirmed: 0, interested: 0, going: 0 };
const momentData = (userId, over = {}) => ({
  id: 'm1', userId, userName: 'Alice', userAvatar: 'https://x/y.png', title: 'Pop-up', description: 'Details',
  category: 'events', latitude: 6.43, longitude: 3.42, geohash: 's1vgd1x',
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 864e5).toISOString(),
  engagementScore: 50, viewsCount: 1, isArchived: false, isBlurred: false, approxAddress: 'VI',
  reactions: { ...ZERO }, commentCount: 0, updatedAt: new Date().toISOString(), ...over
});

async function seedMoment(over = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'moments/m1'), momentData('author', over));
  });
}

async function seedAdmin(uid) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `admins/${uid}`), { addedBy: 'console' });
  });
}

function createMoment(uid, over = {}) {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, 'moments/m1'), momentData(uid, over));
  b.set(doc(d, `users/${uid}`), { lastPostAt: serverTimestamp() }, { merge: true });
  return b.commit();
}

// ---- photo URLs -------------------------------------------------------------------------------

test("photo URLs: https links and the author's own uploads are fine", async () => {
  await assertSucceeds(createMoment('alice', { photoUrl: 'https://images.example.com/a.jpg' }));
  await env.clearFirestore();
  await assertSucceeds(createMoment('alice', { photoUrl: `/photos/alice/${UUID}.webp` }));
});

test('photo URLs: nothing else', async () => {
  const bad = [
    `/photos/someoneelse/${UUID}.webp`,
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'http://insecure.example.com/a.jpg',
    'https://x.example.com/' + 'a'.repeat(600),
    '/photos/alice/../../etc/passwd'
  ];
  for (const photoUrl of bad) {
    await assertFails(createMoment('alice', { photoUrl }));
  }
});

test('the author can swap in a valid photo but not an invalid one', async () => {
  await seedMoment();
  await assertSucceeds(updateDoc(doc(db('author'), 'moments/m1'), { photoUrl: `/photos/author/${UUID}.jpg` }));
  await assertFails(updateDoc(doc(db('author'), 'moments/m1'), { photoUrl: 'data:text/html,hi' }));
});

test('cannot create a moment that is already hidden, reported or confirmed', async () => {
  await assertFails(createMoment('alice', { hidden: true }));
  await assertFails(createMoment('alice', { reportCount: 3 }));
  await assertFails(createMoment('alice', { confirmedNearby: 10 }));
});

// ---- confirmed by people nearby ------------------------------------------------------------------

const confirm = (uid, extra, momentUpdate) => {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, `moments/m1/reactions/${uid}`), { type: 'confirmed', userId: uid, createdAt: 'n', updatedAt: 'n', ...extra });
  b.update(doc(d, 'moments/m1'), momentUpdate);
  return b.commit();
};

test('a confirmed reaction from nearby counts once, backed by coordinates', async () => {
  await seedMoment({ category: 'alerts' });
  await assertSucceeds(confirm('bob', { nearby: true, lat: 6.431, lng: 3.421 }, {
    'reactions.confirmed': increment(1), confirmedNearby: increment(1)
  }));
  const snap = (await getDoc(doc(db('bob'), 'moments/m1'))).data();
  if (snap.confirmedNearby !== 1) throw new Error('confirmedNearby not incremented');
});

test('"nearby" must match the coordinates and the counter', async () => {
  await seedMoment({ category: 'alerts' });
  // too far away (about 11 km)
  await assertFails(confirm('bob', { nearby: true, lat: 6.53, lng: 3.42 }, { 'reactions.confirmed': increment(1), confirmedNearby: increment(1) }));
  // claims nearby without any coordinates
  await assertFails(confirm('bob', { nearby: true }, { 'reactions.confirmed': increment(1), confirmedNearby: increment(1) }));
  // nearby claim but the nearby counter is not moved
  await assertFails(confirm('bob', { nearby: true, lat: 6.431, lng: 3.421 }, { 'reactions.confirmed': increment(1) }));
  // nearby counter moved without a nearby claim
  await assertFails(confirm('bob', {}, { 'reactions.confirmed': increment(1), confirmedNearby: increment(1) }));
  // a confirmed reaction from far away is fine, it just does not count as nearby
  await assertSucceeds(confirm('carol', { nearby: false }, { 'reactions.confirmed': increment(1) }));
});

test('taking back a nearby confirmation lowers the nearby count, and only with the matching decrement', async () => {
  await seedMoment({ category: 'alerts' });
  await assertSucceeds(confirm('bob', { nearby: true, lat: 6.431, lng: 3.421 }, {
    'reactions.confirmed': increment(1), confirmedNearby: increment(1)
  }));
  const d = db('bob');
  const bad = writeBatch(d);
  bad.delete(doc(d, 'moments/m1/reactions/bob'));
  bad.update(doc(d, 'moments/m1'), { 'reactions.confirmed': increment(-1) });
  await assertFails(bad.commit());
  const good = writeBatch(d);
  good.delete(doc(d, 'moments/m1/reactions/bob'));
  good.update(doc(d, 'moments/m1'), { 'reactions.confirmed': increment(-1), confirmedNearby: increment(-1) });
  await assertSucceeds(good.commit());
});

// ---- reports and auto-hide ----------------------------------------------------------------------------

const report = (ctxDb, uid, reason = 'spam', momentUpdate = { reportCount: increment(1) }, extra = {}) => {
  const b = writeBatch(ctxDb);
  b.set(doc(ctxDb, `reports/m1_${uid}`), { momentId: 'm1', reporterId: uid, reason, createdAt: 'now', ...extra });
  b.update(doc(ctxDb, 'moments/m1'), momentUpdate);
  return b.commit();
};

test('a signed-in (non-guest) user can report a moment once', async () => {
  await seedMoment();
  await assertSucceeds(report(real('r1'), 'r1'));
  await assertFails(report(real('r1'), 'r1')); // the same person cannot report it twice
});

test('anonymous guests, the author and signed-out users cannot report', async () => {
  await seedMoment();
  await assertFails(report(guest('g1'), 'g1'));
  await assertFails(report(real('author'), 'author'));
  await assertFails(setDoc(doc(anon(), 'reports/m1_x'), { momentId: 'm1', reporterId: 'x', reason: 'spam', createdAt: 'n' }));
});

test('a report needs a valid reason, its own id and the matching counter', async () => {
  await seedMoment();
  await assertFails(report(real('r1'), 'r1', 'because'));
  await assertFails(report(real('r1'), 'r1', 'spam', { reportCount: increment(2) }));
  await assertFails(report(real('r1'), 'r1', 'spam', { reportCount: increment(1) }, { notes: 'x'.repeat(501) }));
  await assertFails(report(real('r1'), 'r2')); // someone else's report id
  const d = real('r1');
  await assertFails(setDoc(doc(d, 'reports/m1_r1'), { momentId: 'm1', reporterId: 'r1', reason: 'spam', createdAt: 'n' })); // no counter
  await assertFails(updateDoc(doc(d, 'moments/m1'), { reportCount: increment(1) })); // counter without a report
});

test('the hide threshold is exactly three distinct reports', async () => {
  await seedMoment();
  await assertFails(report(real('x1'), 'x1', 'spam', { reportCount: increment(1), hidden: true })); // 1st report cannot hide
  await assertSucceeds(report(real('r1'), 'r1'));
  await assertSucceeds(report(real('r2'), 'r2'));
  await assertFails(report(real('r3'), 'r3')); // the 3rd must set hidden = true
  await assertSucceeds(report(real('r3'), 'r3', 'spam', { reportCount: increment(1), hidden: true }));
  const snap = (await getDoc(doc(anon(), 'moments/m1'))).data();
  if (snap.hidden !== true || snap.reportCount !== 3) throw new Error('not hidden: ' + JSON.stringify(snap));
});

test('reports are private: only admins read them, nobody edits them', async () => {
  await seedMoment();
  await assertSucceeds(report(real('r1'), 'r1'));
  await seedAdmin('admin1');
  await assertSucceeds(getDoc(doc(real('admin1'), 'reports/m1_r1')));
  await assertFails(getDoc(doc(real('r1'), 'reports/m1_r1')));
  await assertFails(getDoc(doc(anon(), 'reports/m1_r1')));
  await assertFails(updateDoc(doc(real('r1'), 'reports/m1_r1'), { reason: 'harassment' }));
  await assertFails(deleteDoc(doc(real('r1'), 'reports/m1_r1')));
  await assertSucceeds(deleteDoc(doc(real('admin1'), 'reports/m1_r1')));
});

test('only an admin can restore a hidden moment, and only as a full reset', async () => {
  await seedMoment({ hidden: true, reportCount: 3 });
  await seedAdmin('admin1');
  await assertFails(updateDoc(doc(real('r1'), 'moments/m1'), { hidden: false, reportCount: 0 }));
  await assertFails(updateDoc(doc(db('author'), 'moments/m1'), { hidden: false, reportCount: 0 }));
  await assertFails(updateDoc(doc(real('admin1'), 'moments/m1'), { hidden: false })); // the counter must reset too
  await assertFails(updateDoc(doc(real('admin1'), 'moments/m1'), { hidden: true, reportCount: 9 }));
  await assertSucceeds(updateDoc(doc(real('admin1'), 'moments/m1'), { hidden: false, reportCount: 0 }));
});

test('admins can delete any moment; regular users still cannot', async () => {
  await seedMoment();
  await seedAdmin('admin1');
  await assertFails(deleteDoc(doc(real('bob'), 'moments/m1')));
  await assertSucceeds(deleteDoc(doc(real('admin1'), 'moments/m1')));
});

test('the admin list is private and read-only from the app', async () => {
  await seedAdmin('admin1');
  await assertSucceeds(getDoc(doc(real('admin1'), 'admins/admin1')));
  await assertFails(getDoc(doc(real('bob'), 'admins/admin1')));
  await assertFails(setDoc(doc(real('bob'), 'admins/bob'), { x: 1 }));
  await assertFails(setDoc(doc(real('admin1'), 'admins/bob'), { x: 1 }));
});
