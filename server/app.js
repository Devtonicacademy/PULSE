import express from 'express';
import path from 'node:path';
import { createPhotoRouter } from './photoRoutes.js';
import { createMapRouter } from './mapRoutes.js';
import { createGeoRouter } from './geoRoutes.js';

/**
 * The PULSE web server: the photo/map/geo APIs, then the web app. The app is served by Next.js
 * (`nextHandler`); without one it falls back to a static build in `distDir`.
 */
export function createApp({ storage, verifyToken, distDir, nextHandler, photoOptions, coverage, mapOptions, geoOptions }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.get('/api/health', (req, res) => res.json({ ok: true, photos: storage.kind, mapCoverage: Boolean(coverage) }));
  app.use(createPhotoRouter({ storage, verifyToken, ...photoOptions }));
  if (coverage) app.use(createMapRouter({ coverage, ...mapOptions }));
  app.use(createGeoRouter(geoOptions));

  // API and photo paths that matched nothing are real 404s, not the app
  app.use(['/api', '/photos'], (req, res) => res.status(404).json({ error: 'Not found' }));

  if (nextHandler) {
    // Everything else (pages, _next assets, public files) belongs to Next.js
    app.use((req, res) => nextHandler(req, res));
    return app;
  }

  // No Next handler (API tests): serve a static build with a single-page fallback
  app.use(
    express.static(distDir, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    })
  );
  app.use((req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  return app;
}
