import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from 'jose';
import { createApp } from '../server/app.js';
import { createFsStorage } from '../server/photoStorage.js';
import { createTokenVerifier } from '../server/firebaseAuth.js';

let server, base, dir;

// A minimal valid-looking WebP / JPEG header (the server sniffs magic bytes, not full decoding)
const webp = (extra = 64) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(extra, 1)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

const fakeVerify = async (token) => {
  if (token === 'alice') return { uid: 'alice1', provider: 'password' };
  if (token === 'bob') return { uid: 'bob22', provider: 'anonymous' };
  if (token === 'carol') return { uid: 'carol3', provider: 'password' };
  if (token === 'dave') return { uid: 'dave4', provider: 'password' };
  throw new Error('bad token');
};

const upload = (body, { token = 'alice', type = 'image/webp' } = {}) =>
  fetch(base + '/api/photos', {
    method: 'POST',
    headers: { 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body
  });

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pulse-photos-'));
  const distDir = path.join(dir, 'dist');
  await import('node:fs/promises').then((fs) => fs.mkdir(distDir, { recursive: true }));
  await writeFile(path.join(distDir, 'index.html'), '<html>app shell</html>');
  const app = createApp({
    storage: createFsStorage(path.join(dir, 'photos')),
    verifyToken: fakeVerify,
    distDir,
    photoOptions: { hourlyLimit: 5, maxBytes: 100 * 1024 }
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

test('health reports the storage driver', async () => {
  const res = await fetch(base + '/api/health');
  assert.deepEqual(await res.json(), { ok: true, photos: 'fs', mapCoverage: false });
});

test('uploads need a valid sign-in', async () => {
  assert.equal((await upload(webp(), { token: null })).status, 401);
  assert.equal((await upload(webp(), { token: 'forged' })).status, 401);
});

test('a WebP upload is stored under the user folder and served back with long-lived caching', async () => {
  const body = webp(500);
  const res = await upload(body);
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.match(json.url, /^\/photos\/alice1\/[0-9a-f-]{36}\.webp$/);
  const got = await fetch(base + json.url);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/webp');
  assert.match(got.headers.get('cache-control'), /immutable/);
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), body);
});

test('JPEG is accepted too', async () => {
  const res = await upload(jpeg(), { token: 'bob', type: 'image/jpeg' });
  assert.equal(res.status, 201);
  assert.match((await res.json()).url, /^\/photos\/bob22\/.+\.jpg$/);
});

test('only WebP and JPEG, judged by the real bytes', async () => {
  assert.equal((await upload(Buffer.from('<script>alert(1)</script>'), { token: 'carol', type: 'image/webp' })).status, 415);
  assert.equal((await upload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { token: 'carol', type: 'image/png' })).status, 415);
  assert.equal((await upload(webp(), { token: 'carol', type: 'text/html' })).status, 415);
  assert.equal((await upload(Buffer.alloc(0), { token: 'carol' })).status, 415);
});

test('oversize photos are refused with a clear message', async () => {
  const res = await upload(webp(200 * 1024), { token: 'bob' });
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /too large/i);
});

test('uploads are rate limited per user', async () => {
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await upload(webp(), { token: 'dave' })).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429, 429]);
});

test('photo paths cannot escape the user folder', async () => {
  for (const p of ['/photos/..%2Fetc/passwd', '/photos/alice1/not-a-uuid.webp', '/photos/alice1/%2e%2e%2f%2e%2e%2fpackage.json', '/photos/a%2Fb/00000000-0000-0000-0000-000000000000.webp']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 404, p);
  }
});

test('unknown API paths are 404 JSON, other paths fall back to the app shell', async () => {
  const api = await fetch(base + '/api/nothing');
  assert.equal(api.status, 404);
  assert.equal((await api.json()).error, 'Not found');
  const shell = await fetch(base + '/some/client/route');
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /app shell/);
});

// ---- Firebase ID token verification ---------------------------------------------------------

async function tokenSetup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims, { iss = 'https://securetoken.google.com/pulse-test', aud = 'pulse-test', exp = '1h' } = {}) =>
    new SignJWT({ firebase: { sign_in_provider: 'anonymous' }, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('user123').setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp)
      .sign(privateKey);
  return { jwks, sign };
}

test('token verifier accepts a correctly signed token for this project', async () => {
  const { jwks, sign } = await tokenSetup();
  const verify = createTokenVerifier({ projectId: 'pulse-test', jwks });
  assert.deepEqual(await verify(await sign({})), { uid: 'user123', provider: 'anonymous' });
});

test('token verifier rejects other projects, bad signatures, expired and garbage tokens', async () => {
  const { jwks, sign } = await tokenSetup();
  const verify = createTokenVerifier({ projectId: 'pulse-test', jwks });
  await assert.rejects(verify(await sign({}, { aud: 'other-project' })));
  await assert.rejects(verify(await sign({}, { iss: 'https://securetoken.google.com/other' })));
  await assert.rejects(verify(await sign({}, { exp: '-1h' })));
  await assert.rejects(verify('not.a.token'));
  const other = await tokenSetup(); // signed by a different key than the verifier trusts
  await assert.rejects(verify(await other.sign({})));
});

test('emulator mode only decodes tokens (never for production)', async () => {
  const verify = createTokenVerifier({ projectId: 'pulse-test', emulator: true });
  const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"user_id":"emu1","firebase":{"sign_in_provider":"anonymous"}}').toString('base64url')}.`;
  assert.deepEqual(await verify(unsigned), { uid: 'emu1', provider: 'anonymous' });
});
