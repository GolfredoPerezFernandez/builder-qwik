import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceLogo = 'src/media/logo.png'; // Using the original MOA logo as source

const icons = [
  { size: 16, name: 'favicon-16x16.png', dir: 'public' },
  { size: 32, name: 'favicon-32x32.png', dir: 'public' },
  { size: 192, name: 'android-chrome-192x192.png', dir: 'public' },
  { size: 512, name: 'android-chrome-512x512.png', dir: 'public' },
  { size: 180, name: 'apple-touch-icon.png', dir: 'public' },
  { size: 512, name: 'logo.png', dir: 'public' },
];

async function generate() {
  if (!fs.existsSync(sourceLogo)) {
    console.error(`Source logo not found: ${sourceLogo}`);
    return;
  }
  for (const icon of icons) {
    const outputPath = path.join(icon.dir, icon.name);
    console.log(`Generating ${outputPath}...`);
    await sharp(sourceLogo)
      .resize(icon.size, icon.size)
      .png()
      .toFile(outputPath);
  }
}

generate().catch(console.error);
