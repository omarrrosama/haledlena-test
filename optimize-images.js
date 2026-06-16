/**
 * optimize-images.js
 * ------------------------------------------------------------
 * Compresses & resizes images in uploads/products without
 * destroying quality. Run it whenever the client dumps big images.
 *
 *   node optimize-images.js                 # optimize uploads/products
 *   node optimize-images.js ./some/folder   # optimize a custom folder
 *
 * Requires: npm install sharp
 * ------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ---- Settings (tweak if you want) --------------------------
const MAX_WIDTH = 1600;     // px — product images rarely need to be wider
const MAX_HEIGHT = 1600;    // px
const JPEG_QUALITY = 82;    // 80–85 = high quality, much smaller file
const PNG_QUALITY = 82;
const WEBP_QUALITY = 82;
const SKIP_UNDER_KB = 300;  // don't touch files already smaller than this
// ------------------------------------------------------------

// Folder to process: argument or default uploads/products
const TARGET_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'uploads', 'products');

const VALID_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

async function optimizeImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const originalSize = fs.statSync(filePath).size;

  // Skip files that are already small
  if (originalSize / 1024 < SKIP_UNDER_KB) {
    return { skipped: true, name: path.basename(filePath) };
  }

  const tmpPath = filePath + '.tmp';

  let pipeline = sharp(filePath).rotate(); // auto-orient from EXIF

  // Resize only if larger than the max — never upscale
  pipeline = pipeline.resize({
    width: MAX_WIDTH,
    height: MAX_HEIGHT,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (ext === '.png') {
    pipeline = pipeline.png({ quality: PNG_QUALITY, compressionLevel: 9 });
  } else if (ext === '.webp') {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  } else {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  }

  await pipeline.toFile(tmpPath);

  const newSize = fs.statSync(tmpPath).size;

  // Only replace if we actually made it smaller
  if (newSize < originalSize) {
    fs.renameSync(tmpPath, filePath);
    return {
      name: path.basename(filePath),
      originalSize,
      newSize,
      saved: originalSize - newSize,
    };
  } else {
    fs.unlinkSync(tmpPath);
    return { skipped: true, name: path.basename(filePath), reason: 'no gain' };
  }
}

async function run() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`❌ Folder not found: ${TARGET_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(TARGET_DIR)
    .filter((f) => VALID_EXT.includes(path.extname(f).toLowerCase()));

  if (files.length === 0) {
    console.log(`No images found in ${TARGET_DIR}`);
    return;
  }

  console.log(`\nOptimizing ${files.length} image(s) in ${TARGET_DIR}\n`);

  let totalOriginal = 0;
  let totalNew = 0;
  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(TARGET_DIR, file);
    try {
      const result = await optimizeImage(filePath);

      if (result.skipped) {
        skipped++;
        console.log(`  ⏭️  ${result.name}  (skipped${result.reason ? ': ' + result.reason : ', already small'})`);
      } else {
        processed++;
        totalOriginal += result.originalSize;
        totalNew += result.newSize;
        const pct = ((result.saved / result.originalSize) * 100).toFixed(0);
        console.log(
          `  ✅ ${result.name}  ${kb(result.originalSize)} KB → ${kb(result.newSize)} KB  (-${pct}%)`
        );
      }
    } catch (err) {
      console.error(`  ❌ ${file}  — ${err.message}`);
    }
  }

  console.log(`\n----------------------------------------`);
  console.log(`Processed: ${processed} | Skipped: ${skipped}`);
  if (processed > 0) {
    const savedPct = (((totalOriginal - totalNew) / totalOriginal) * 100).toFixed(0);
    console.log(`Total: ${kb(totalOriginal)} KB → ${kb(totalNew)} KB  (saved ${savedPct}%)`);
  }
  console.log(`----------------------------------------\n`);
}

run();
