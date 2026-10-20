const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processIcons() {
  const dir = path.join(__dirname, '..', 'buff icon');
  const pubDir = path.join(__dirname, '..', 'public', 'buff icon');

  if (!fs.existsSync(pubDir)) {
    fs.mkdirSync(pubDir, { recursive: true });
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg'));
  console.log(`Found ${files.length} JPG files in ${dir}`);

  for (const file of files) {
    const baseName = path.basename(file, '.jpg');
    const inputPath = path.join(dir, file);
    const outWebpPath = path.join(dir, `${baseName}.webp`);
    const pubWebpPath = path.join(pubDir, `${baseName}.webp`);

    const img = sharp(inputPath);
    const meta = await img.metadata();
    const raw = await img.raw().toBuffer();
    const w = meta.width, h = meta.height;
    const out = Buffer.alloc(w * h * 4);

    const isCold = file.includes('寒冷');

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstIdx = (y * w + x) * 4;
        let r = raw[srcIdx], g = raw[srcIdx + 1], b = raw[srcIdx + 2];

        // 寒冷.jpg top 4 rows have bright artifact line
        if (isCold && y < 4 && r > 180) {
          out[dstIdx] = 0;
          out[dstIdx + 1] = 0;
          out[dstIdx + 2] = 0;
          out[dstIdx + 3] = 0;
          continue;
        }

        const maxVal = Math.max(r, g, b);
        if (maxVal <= 12) {
          out[dstIdx] = 0;
          out[dstIdx + 1] = 0;
          out[dstIdx + 2] = 0;
          out[dstIdx + 3] = 0;
        } else if (maxVal >= 50) {
          out[dstIdx] = r;
          out[dstIdx + 1] = g;
          out[dstIdx + 2] = b;
          out[dstIdx + 3] = 255;
        } else {
          const a = (maxVal - 12) / 38;
          const alpha = Math.round(a * 255);
          out[dstIdx] = Math.min(255, Math.round(r / a));
          out[dstIdx + 1] = Math.min(255, Math.round(g / a));
          out[dstIdx + 2] = Math.min(255, Math.round(b / a));
          out[dstIdx + 3] = alpha;
        }
      }
    }

    // Standardize large images (e.g. 1024 or 2048) to high-quality crisp WebP
    let pipeline = sharp(out, { raw: { width: w, height: h, channels: 4 } });
    if (w > 512 || h > 512) {
      pipeline = pipeline.resize({ width: 512, height: 512, fit: 'inside' });
    }

    const webpBuf = await pipeline.webp({ quality: 90, alphaQuality: 95 }).toBuffer();

    fs.writeFileSync(outWebpPath, webpBuf);
    fs.writeFileSync(pubWebpPath, webpBuf);

    // Delete the original JPG file
    fs.unlinkSync(inputPath);

    console.log(`Converted & saved: ${baseName}.webp (${webpBuf.length} bytes), deleted JPG`);
  }

  console.log('All icons converted to WebP successfully!');
}

processIcons().catch(err => {
  console.error('Error processing icons:', err);
  process.exit(1);
});
