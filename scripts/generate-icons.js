import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, body, crcBuf]);
}

function generatePng(size, outPath) {
  const width = size;
  const height = size;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  const cx = width / 2;
  const cy = height / 2;
  const r = size * 0.44;

  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // Filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Gradient from Coral (#FF4757) to Amber (#FFA502) with dark background
        const ratio = (x + y) / (width + height);
        const red = Math.round(255 * (1 - ratio * 0.1));
        const green = Math.round(71 + ratio * 94);
        const blue = Math.round(87 * (1 - ratio * 0.8));
        raw[p++] = red;
        raw[p++] = green;
        raw[p++] = blue;
        raw[p++] = 255; // Alpha
      } else {
        // Rounded dark card background
        const margin = size * 0.05;
        if (x >= margin && x <= width - margin && y >= margin && y <= height - margin) {
          raw[p++] = 11;
          raw[p++] = 15;
          raw[p++] = 25;
          raw[p++] = 255;
        } else {
          raw[p++] = 0;
          raw[p++] = 0;
          raw[p++] = 0;
          raw[p++] = 0;
        }
      }
    }
  }

  const deflated = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}

const pubDir = path.resolve('public');
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

generatePng(192, path.join(pubDir, 'icon-192.png'));
generatePng(512, path.join(pubDir, 'icon-512.png'));
generatePng(180, path.join(pubDir, 'apple-touch-icon.png'));
