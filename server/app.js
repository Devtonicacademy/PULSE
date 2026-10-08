import express from 'express';
import path from 'node:path';
import { createPhotoRouter } from './photoRoutes.js';
import { createMapRouter } from './mapRoutes.js';

/** The PULSE web server: static app, SPA fallback and the photo API */
export function createApp({ storage, verifyToken, distDir, photoOptions, coverage, mapOptions }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.get('/api/health', (req, res) => res.json({ ok: true, photos: storage.kind, mapCoverage: Boolean(coverage) }));
  app.use(createPhotoRouter({ storage, verifyToken, ...photoOptions }));
  if (coverage) app.use(createMapRouter({ coverage, ...mapOptions }));

  // Serve static assets from Vite build directory
  app.use(
    express.static(distDir, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        // Aggressive caching for hashed assets
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    })
  );

  // API and photo paths that matched nothing are real 404s, not the app shell
  app.use(['/api', '/photos'], (req, res) => res.status(404).json({ error: 'Not found' }));

  // SPA Fallback: Any unmatched route serves index.html for client-side routing
  // Express 5 compatible middleware fallback
  app.use((req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  return app;
}
