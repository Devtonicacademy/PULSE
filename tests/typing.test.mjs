import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TypingTracker, typingLabel, TYPING_TTL_MS } = await import('../src/services/typingPresence.ts');

const entry = (userId, stamp, userName = userId) => ({ userId, userName, stamp });

test('someone whose record keeps changing is typing; yourself is never listed', () => {
  const t = new TypingTracker();
  t.observe([entry('ada', 1), entry('me', 1)], 1000);
  assert.deepEqual(t.active('me', 1500).map((x) => x.userId), ['ada']);
});

test('a typist who stops refreshing disappears after the TTL, without any event arriving', () => {
  const t = new TypingTracker();
  t.observe([entry('ada', 1)], 0);
  assert.equal(t.active('me', TYPING_TTL_MS - 1).length, 1);
  assert.equal(t.active('me', TYPING_TTL_MS + 1).length, 0);
});

test('a refreshed record extends typing; an unchanged snapshot does not', () => {
  const t = new TypingTracker();
  t.observe([entry('ada', 1)], 0);
  t.observe([entry('ada', 1)], 5000); // same record seen again: still the old activity
  assert.equal(t.active('me', 7000).length, 0);
  t.observe([entry('ada', 2)], 7000); // she typed again
  assert.equal(t.active('me', 9000).length, 1);
});

test('a removed record means the person stopped (sent, left or cleared the box)', () => {
  const t = new TypingTracker();
  t.observe([entry('ada', 1), entry('bo', 1)], 0);
  t.observe([entry('bo', 1)], 100);
  assert.deepEqual(t.active('me', 200).map((x) => x.userId), ['bo']);
});

test('device clock differences do not matter: only the change is timed locally', () => {
  const t = new TypingTracker();
  // The server stamp is hours in the "future" compared to our clock
  t.observe([entry('ada', 9_999_999_999_999)], 5000);
  assert.equal(t.active('me', 6000).length, 1);
});

test('typing label reads naturally for one, two and many people', () => {
  assert.equal(typingLabel([]), '');
  assert.equal(typingLabel(['Ada']), 'Ada is typing…');
  assert.equal(typingLabel(['Ada', 'Bo']), 'Ada and Bo are typing…');
  assert.equal(typingLabel(['Ada', 'Bo', 'Cy']), 'Ada, Bo and 1 other are typing…');
  assert.equal(typingLabel(['Ada', 'Bo', 'Cy', 'Di']), 'Ada, Bo and 2 others are typing…');
});
