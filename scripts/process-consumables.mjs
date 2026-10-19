import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function processImage(inputPath, outputName, aliasName) {
  console.log(`Processing: ${inputPath}`);
  const image = sharp(inputPath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  
  // Background mask
  const isPureBg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const minC = Math.min(r, g, b);
      const maxC = Math.max(r, g, b);
      if (minC >= 238 && (maxC - minC) <= 22) {
        isPureBg[y * w + x] = 1;
      }
    }
  }

  // BFS Flood Fill from outer border
  const visited = new Uint8Array(w * h);
  const bgMask = new Uint8Array(w * h);
  const queue = new Int32Array(w * h * 2);
  let head = 0;
  let tail = 0;

  function push(x, y) {
    const idx = y * w + x;
    if (!visited[idx] && isPureBg[idx]) {
      visited[idx] = 1;
      queue[tail++] = x;
      queue[tail++] = y;
    }
  }

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (head < tail) {
    const cx = queue[head++];
    const cy = queue[head++];
    const cIdx = cy * w + cx;
    bgMask[cIdx] = 1;

    const neighbors = [
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
    ];
    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (!visited[nIdx] && isPureBg[nIdx]) {
          visited[nIdx] = 1;
          queue[tail++] = nx;
          queue[tail++] = ny;
        }
      }
    }
  }

  // RGBA buffer
  const rgba = Buffer.alloc(w * h * 4);
  let minX = w, maxX = 0, minY = h, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const srcIdx = idx * ch;
      const dstIdx = idx * 4;

      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];

      if (bgMask[idx]) {
        rgba[dstIdx] = 0;
        rgba[dstIdx + 1] = 0;
        rgba[dstIdx + 2] = 0;
        rgba[dstIdx + 3] = 0;
      } else {
        // Check if neighbor to background for de-fringing
        let hasBgNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (bgMask[ny * w + nx]) {
                hasBgNeighbor = true;
                break;
              }
            }
          }
          if (hasBgNeighbor) break;
        }

        const minC = Math.min(r, g, b);
        if (hasBgNeighbor && minC > 200) {
          const alpha = Math.max(0, Math.min(1, (252 - minC) / (252 - 200)));
          const aByte = Math.round(alpha * 255);
          if (aByte > 0) {
            rgba[dstIdx] = Math.round(Math.min(255, Math.max(0, (r - (1 - alpha) * 253) / alpha)));
            rgba[dstIdx + 1] = Math.round(Math.min(255, Math.max(0, (g - (1 - alpha) * 253) / alpha)));
            rgba[dstIdx + 2] = Math.round(Math.min(255, Math.max(0, (b - (1 - alpha) * 253) / alpha)));
            rgba[dstIdx + 3] = aByte;
          } else {
            rgba[dstIdx] = 0;
            rgba[dstIdx + 1] = 0;
            rgba[dstIdx + 2] = 0;
            rgba[dstIdx + 3] = 0;
          }
        } else {
          rgba[dstIdx] = r;
          rgba[dstIdx + 1] = g;
          rgba[dstIdx + 2] = b;
          rgba[dstIdx + 3] = 255;
        }

        if (rgba[dstIdx + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  // Padding
  const pad = 16;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(w - cropX, (maxX - minX + 1) + pad * 2);
  const cropH = Math.min(h - cropY, (maxY - minY + 1) + pad * 2);

  console.log(`BBox: [${minX}, ${minY}, ${maxX}, ${maxY}] -> Crop: [${cropX}, ${cropY}, ${cropW}, ${cropH}]`);

  const outDir = path.resolve('public/assets/Equipments');
  const targetPath = path.join(outDir, outputName);

  const cropped = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(384, 384, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 95 })
    .toFile(targetPath);

  console.log(`Saved ${targetPath} (${cropped.width}x${cropped.height}, ${cropped.size} bytes)`);

  if (aliasName) {
    const aliasPath = path.join(outDir, aliasName);
    fs.copyFileSync(targetPath, aliasPath);
    console.log(`Copied alias ${aliasPath}`);
  }
}

async function run() {
  await processImage('public/assets/補血藥.jpg', '補血藥.webp', '治療藥.webp');
  await processImage('public/assets/解毒劑.jpg', '解毒劑.webp', '解毒藥.webp');
  await processImage('public/assets/修整帳篷.jpg', '修整帳篷.webp', null);
  console.log('All processed successfully!');
}

run();
