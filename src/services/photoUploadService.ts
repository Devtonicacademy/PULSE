import { auth, isFirebaseConfigured } from './firebaseClient';

/**
 * Photos are shrunk on the device (max 1600 px, WebP at about 0.8) and then uploaded to the PULSE
 * server (POST /api/photos), which stores them in a Railway bucket. The server needs a Firebase
 * sign-in; signed-out visitors can still paste an image link.
 */

const MAX_SIDE = 1600;
const START_QUALITY = 0.8;
/** The server accepts up to 700 kB; aim lower so uploads stay quick on mobile data */
const TARGET_BYTES = 600 * 1024;

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export class PhotoUploadError extends Error {}

export function canUploadPhotos(): boolean {
  return Boolean(isFirebaseConfigured && auth?.currentUser);
}

async function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      // 'from-image' applies the EXIF rotation phone cameras record
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the <img> route
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Resizes to at most 1600 px on the long side and encodes WebP (JPEG where WebP is unsupported) */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new PhotoUploadError('Please choose an image file.');
  }

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new PhotoUploadError('That image could not be read. Try a JPEG, PNG or WebP photo.');
  }

  try {
    let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    let quality = START_QUALITY;
    let best: CompressedPhoto | null = null;

    // Re-encode a few times (lower quality, then smaller) until the file is small enough
    for (let attempt = 0; attempt < 5; attempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new PhotoUploadError('This browser cannot process photos.');
      ctx.drawImage(bitmap.source, 0, 0, width, height);

      // Browsers without WebP encoding silently return PNG, which the server does not take
      let blob = await encode(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', quality);
      if (!blob) throw new PhotoUploadError('Could not compress the photo.');

      best = { blob, width, height };
      if (blob.size <= TARGET_BYTES) break;
      if (quality > 0.5) quality -= 0.15;
      else scale *= 0.8;
    }
    return best!;
  } finally {
    bitmap.release();
  }
}

/** Uploads a compressed photo; resolves to the URL to store on the moment (a /photos/... path) */
export async function uploadPhoto(photo: CompressedPhoto): Promise<string> {
  const user = auth?.currentUser;
  if (!user) {
    throw new PhotoUploadError('Sign in to upload photos, or paste an image link instead.');
  }

  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await fetch('/api/photos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': photo.blob.type },
      body: photo.blob
    });
  } catch {
    throw new PhotoUploadError('Could not reach the server. Check your connection, or paste an image link instead.');
  }

  if (!response.ok) {
    let message = '';
    try {
      message = (await response.json()).error;
    } catch {
      // not JSON (for example the app is hosted without the photo server)
    }
    throw new PhotoUploadError(
      message || 'Photo upload is not available right now. Paste an image link instead.'
    );
  }
  const { url } = (await response.json()) as { url: string };
  return url;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
