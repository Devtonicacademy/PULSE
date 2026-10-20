import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app.js';
import { storageFromEnv } from './server/photoStorage.js';
import { createTokenVerifier } from './server/firebaseAuth.js';
import { createOverpassClient } from './server/osm/overpass.js';
import { createCoverageService } from './server/osm/coverage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `node server.js --dev` runs Next.js in development (hot reload); otherwise it serves the production build
const dev = process.argv.includes('--dev');
process.env.NODE_ENV = dev ? 'development' : 'production';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'quizapp-project-c5e0e';

// Loaded after NODE_ENV is set, so Next picks the right mode
const { default: next } = await import('next');
const nextApp = next({ dev, dir: __dirname, hostname: HOST, port: PORT });
await nextApp.prepare();

const storage = storageFromEnv();
const verifyToken = createTokenVerifier({
  projectId: PROJECT_ID,
  emulator: Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
});

const coverage = createCoverageService({
  storage,
  overpass: createOverpassClient({ log: (message) => console.warn('[PULSE map]', message) }),
  log: (message) => console.warn('[PULSE map]', message)
});

const app = createApp({
  storage,
  verifyToken,
  distDir: path.join(__dirname, 'dist'),
  nextHandler: nextApp.getRequestHandler(),
  coverage
});

app.listen(PORT, HOST, () => {
  console.log(
    `⚡ [PULSE] ${dev ? 'Development' : 'Production'} server (Next.js) running on http://${HOST}:${PORT} (photos: ${storage.kind})`
  );
});
