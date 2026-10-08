import express from 'express';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 700 * 1024; // photos are compressed on the device first (~100-400 kB)
const HOURLY_LIMIT = 20;

/** The real type, from the first bytes of the file (the Content-Type header is not trusted) */
function sniffImageType(buffer) {
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  return null;
}

/**
 * Photo upload / download routes. Uploads need a Firebase ID token, are limited per user per
 * hour, and only accept WebP or JPEG up to MAX_BYTES. Photos live under `<uid>/<uuid>.<ext>`.
 */
export function createPhotoRouter({ storage, verifyToken, maxBytes = MAX_BYTES, hourlyLimit = HOURLY_LIMIT, now = Date.now }) {
  const router = express.Router();
  const uploads = new Map(); // uid -> upload timestamps in the last hour

  async function authenticate(req, res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Sign in to upload photos.' });
      return;
    }
    try {
      req.user = await verifyToken(token);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired sign-in.' });
    }
  }

  function rateLimit(req, res, next) {
    const cutoff = now() - 60 * 60 * 1000;
    const recent = (uploads.get(req.user.uid) || []).filter((t) => t > cutoff);
    if (recent.length >= hourlyLimit) {
      res.status(429).json({ error: 'Upload limit reached. Try again later.' });
      return;
    }
    recent.push(now());
    uploads.set(req.user.uid, recent);
    next();
  }

  router.post(
    '/api/photos',
    authenticate,
    rateLimit,
    express.raw({ type: ['image/webp', 'image/jpeg'], limit: maxBytes }),
    async (req, res) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(415).json({ error: 'Send a WebP or JPEG image as the request body.' });
        return;
      }
      const type = sniffImageType(body);
      if (!type) {
        res.status(415).json({ error: 'Only WebP and JPEG photos are accepted.' });
        return;
      }
      try {
        const key = `${req.user.uid}/${randomUUID()}.${type.ext}`;
        await storage.put(key, body, type.mime);
        res.status(201).json({ url: `/photos/${key}`, bytes: body.length });
      } catch (err) {
        console.error('[PULSE photos] Upload failed:', err.message);
        res.status(502).json({ error: 'Could not store the photo. Try again.' });
      }
    }
  );

  router.get('/photos/:uid/:file', async (req, res) => {
    const { uid, file } = req.params;
    if (!/^[A-Za-z0-9]{1,128}$/.test(uid) || !/^[0-9a-f-]{36}\.(webp|jpg)$/.test(file)) {
      res.status(404).end();
      return;
    }
    try {
      const data = await storage.get(`${uid}/${file}`);
      if (!data) {
        res.status(404).end();
        return;
      }
      res.set({
        'Content-Type': file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      });
      res.send(data);
    } catch (err) {
      console.error('[PULSE photos] Read failed:', err.message);
      res.status(502).end();
    }
  });

  // Body parser errors (too large) become clean JSON answers
  router.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      res.status(413).json({ error: `Photo is too large (max ${Math.round(maxBytes / 1024)} kB after compression).` });
      return;
    }
    next(err);
  });

  return router;
}
