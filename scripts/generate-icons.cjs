// Generates the app icon, Android adaptive icon foreground, and splash icon as PNGs (no image dependencies).
// The mark is a white shopping bag on Grocefy green. Run: node scripts/generate-icons.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const GREEN = [0x22, 0x78, 0x4b];
const WHITE = [0xff, 0xff, 0xff];

/** 0..1 coverage of the bag mark at (x, y) on a 1024 grid. */
function bagCoverage(x, y) {
  const inRoundedRect = (left, top, right, bottom, radius) => {
    if (x < left || x > right || y < top || y > bottom) return false;
    const cx = Math.min(Math.max(x, left + radius), right - radius);
    const cy = Math.min(Math.max(y, top + radius), bottom - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  const body = inRoundedRect(300, 420, 724, 770, 56);
  // Handle: the top half of a ring above the bag's opening.
  const distance = Math.hypot(x - 512, y - 430);
  const handle = y <= 430 && distance >= 92 && distance <= 132;
  return body || handle;
}

function render(size, { background, mark, scale = 1 }) {
  const samples = 4; // supersampling for smooth edges
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        // Map to the 1024 design grid, optionally scaled around the centre.
        const gx = 512 + (((px + (sx + 0.5) / samples) / size) * 1024 - 512) / scale;
        const gy = 512 + (((py + (sy + 0.5) / samples) / size) * 1024 - 512) / scale;
        if (bagCoverage(gx, gy)) hits++;
      }
      const coverage = hits / (samples * samples);
      const offset = (py * size + px) * 4;
      if (background) {
        for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(background[c] * (1 - coverage) + mark[c] * coverage);
        pixels[offset + 3] = 255;
      } else {
        for (let c = 0; c < 3; c++) pixels[offset + c] = mark[c];
        pixels[offset + 3] = Math.round(255 * coverage);
      }
    }
  }
  return encodePng(size, size, pixels);
}

function encodePng(width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
// Store / legacy icon: opaque green square with the white bag.
fs.writeFileSync(path.join(out, 'icon.png'), render(1024, { background: GREEN, mark: WHITE }));
// Android adaptive icon foreground: white bag on transparent, shrunk to sit inside the safe zone.
fs.writeFileSync(path.join(out, 'adaptive-icon.png'), render(1024, { mark: WHITE, scale: 0.8 }));
// Splash: green bag on transparent (the splash background colour comes from app.json).
fs.writeFileSync(path.join(out, 'splash-icon.png'), render(512, { mark: GREEN }));
console.log('Wrote assets/icon.png, assets/adaptive-icon.png, assets/splash-icon.png');
