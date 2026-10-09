import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

// Object keys are `<firebase uid>/<uuid>.<webp|jpg>`; anything else is refused before it reaches a driver
const KEY_PATTERN = /^[A-Za-z0-9]{1,128}\/[0-9a-f-]{36}\.(webp|jpg)$/;

// Cached map data lives next to the photos: `osm/v<format>/<origin id>/<cellX>_<cellY>.json.gz`
const MAP_KEY_PATTERN = /^osm\/(v\d{1,3}\/)?[A-Za-z0-9._-]{1,40}\/-?\d{1,5}_-?\d{1,5}\.json\.gz$/;

function assertKey(key) {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid photo key');
}

function assertMapKey(key) {
  if (!MAP_KEY_PATTERN.test(key)) throw new Error('Invalid map data key');
}

/** Local disk storage, for development and tests */
export function createFsStorage(dir) {
  return {
    kind: 'fs',
    async put(key, buffer) {
      assertKey(key);
      const file = path.join(dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buffer);
    },
    async get(key) {
      assertKey(key);
      try {
        return await readFile(path.join(dir, key));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async putMapData(key, buffer) {
      assertMapKey(key);
      const file = path.join(dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buffer);
    },
    async hasMapData(key) {
      assertMapKey(key);
      try {
        await stat(path.join(dir, key));
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
      }
    },
    async getMapData(key) {
      assertMapKey(key);
      try {
        return await readFile(path.join(dir, key));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    }
  };
}

/** S3-compatible storage (Railway buckets) over plain signed fetch requests */
export function createS3Storage({ endpoint, bucket, region, accessKeyId, secretAccessKey, urlStyle = 'virtual-hosted' }) {
  const client = new AwsClient({ accessKeyId, secretAccessKey, region: region || 'auto', service: 's3' });
  const base = new URL(endpoint);

  const urlFor = (key) => {
    if (urlStyle === 'path') {
      return `${base.origin}/${bucket}/${key}`;
    }
    return `${base.protocol}//${bucket}.${base.host}/${key}`;
  };

  return {
    kind: 's3',
    async put(key, buffer, contentType) {
      assertKey(key);
      const res = await client.fetch(urlFor(key), {
        method: 'PUT',
        body: buffer,
        headers: { 'content-type': contentType }
      });
      if (!res.ok) throw new Error(`Bucket upload failed: ${res.status}`);
    },
    async get(key) {
      assertKey(key);
      const res = await client.fetch(urlFor(key));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Bucket read failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async putMapData(key, buffer) {
      assertMapKey(key);
      const res = await client.fetch(urlFor(key), {
        method: 'PUT',
        body: buffer,
        headers: { 'content-type': 'application/gzip' }
      });
      if (!res.ok) throw new Error(`Bucket upload failed: ${res.status}`);
    },
    async hasMapData(key) {
      assertMapKey(key);
      const res = await client.fetch(urlFor(key), { method: 'HEAD' });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Bucket read failed: ${res.status}`);
      return true;
    },
    async getMapData(key) {
      assertMapKey(key);
      const res = await client.fetch(urlFor(key));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Bucket read failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
  };
}

/** Picks the driver from environment variables (PHOTO_STORAGE=s3 on Railway, disk otherwise) */
export function storageFromEnv(env = process.env) {
  if (env.PHOTO_STORAGE === 's3') {
    for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      if (!env[name]) throw new Error(`${name} is required when PHOTO_STORAGE=s3`);
    }
    return createS3Storage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      urlStyle: env.S3_URL_STYLE
    });
  }
  return createFsStorage(env.PHOTO_DIR || path.join(process.cwd(), '.photo-uploads'));
}
