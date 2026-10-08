import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app.js';
import { storageFromEnv } from './server/photoStorage.js';
import { createTokenVerifier } from './server/firebaseAuth.js';
import { createOverpassClient } from './server/osm/overpass.js';
import { createCoverageService } from './server/osm/coverage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'quizapp-project-c5e0e';

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

const app = createApp({ storage, verifyToken, distDir: path.join(__dirname, 'dist'), coverage });

app.listen(PORT, HOST, () => {
  console.log(`⚡ [PULSE] Live Production Server running on http://${HOST}:${PORT} (photos: ${storage.kind})`);
});
