// Generates simple extension icons using Node.js built-in modules (no dependencies)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPNG(size) {
  // Create RGBA pixel data for a rounded-square icon with a gradient
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.2; // corner radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const margin = size * 0.04;

      // Rounded rectangle check
      const inRect = isInRoundedRect(x, y, margin, margin, size - margin * 2, size - margin * 2, radius);

      if (inRect) {
        // Gradient from indigo (#6366f1) to purple (#a78bfa)
        const t = (x + y) / (size * 2);
        const r = Math.round(99 + (167 - 99) * t);    // 6366f1 -> a78bfa
        const g = Math.round(102 + (139 - 102) * t);
        const b = Math.round(241 + (250 - 241) * t);

        // Draw </> code brackets in white
        const inBracket = drawCodeBrackets(x, y, size);

        if (inBracket) {
          pixels[idx] = 255;     // R
          pixels[idx + 1] = 255; // G
          pixels[idx + 2] = 255; // B
          pixels[idx + 3] = 240; // A
        } else {
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      } else {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  // PNG encoding
  // Add filter byte (0 = None) at start of each row
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // filter: None
    pixels.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeB = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeB, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);

  return Buffer.concat([len, payload, crc]);
}

function isInRoundedRect(px, py, x, y, w, h, r) {
  // Check if point is inside rounded rectangle
  if (px < x || px > x + w || py < y || py > y + h) return false;

  // Check corners
  const corners = [
    [x + r, y + r],         // top-left
    [x + w - r, y + r],     // top-right
    [x + r, y + h - r],     // bottom-left
    [x + w - r, y + h - r], // bottom-right
  ];

  for (const [cx, cy] of corners) {
    const isInCornerRegion =
      (px < x + r && py < y + r && px < cx && py < cy) ||
      (px > x + w - r && py < y + r && px > cx && py < cy) ||
      (px < x + r && py > y + h - r && px < cx && py > cy) ||
      (px > x + w - r && py > y + h - r && px > cx && py > cy);

    if (isInCornerRegion) {
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (dist > r) return false;
    }
  }

  return true;
}

function drawCodeBrackets(x, y, size) {
  // Draw simple </> icon
  const s = size;
  const centerY = s / 2;
  const bracketWidth = s * 0.12;
  const armLength = s * 0.22;
  const thickness = Math.max(1, s * 0.06);

  // Left bracket <
  const leftX = s * 0.22;
  const leftTipX = leftX - armLength * 0.6;

  // Check if point is on the left bracket
  if (isOnLine(x, y, leftX, centerY - armLength, leftTipX, centerY, thickness) ||
      isOnLine(x, y, leftTipX, centerY, leftX, centerY + armLength, thickness)) {
    return true;
  }

  // Right bracket >
  const rightX = s * 0.78;
  const rightTipX = rightX + armLength * 0.6;

  if (isOnLine(x, y, rightX, centerY - armLength, rightTipX, centerY, thickness) ||
      isOnLine(x, y, rightTipX, centerY, rightX, centerY + armLength, thickness)) {
    return true;
  }

  // Slash /
  const slashTop = centerY - armLength * 0.8;
  const slashBottom = centerY + armLength * 0.8;
  const slashLeftX = s * 0.44;
  const slashRightX = s * 0.56;

  if (isOnLine(x, y, slashRightX, slashTop, slashLeftX, slashBottom, thickness)) {
    return true;
  }

  return false;
}

function isOnLine(px, py, x1, y1, x2, y2, thickness) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return false;

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  return dist <= thickness;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`✓ Created ${filePath} (${png.length} bytes)`);
});

console.log('\nDone! Icons generated successfully.');
