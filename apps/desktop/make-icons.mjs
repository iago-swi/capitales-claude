/**
 * Renders the application icons from SVG.
 *
 * Two sources rather than one: at 16-32px the detailed marker turns to mud, so
 * the small sizes come from a simplified drawing with a heavier ring and a
 * larger dot. That is the difference between an icon and a scaled-down image.
 *
 * Run with: npm run icons -w @capitales/desktop
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, 'assets');

/** Below this the detailed drawing stops being legible. */
const SIMPLIFY_BELOW = 48;

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Freedesktop icon theme sizes, for the Linux icons directory. */
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512];

const detailed = await readFile(path.join(ASSETS, 'icon.svg'));
const simple = await readFile(path.join(ASSETS, 'icon-small.svg'));

const render = (size) =>
  sharp(size < SIMPLIFY_BELOW ? simple : detailed, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer();

// Windows: one .ico carrying every size the shell might ask for.
const icoParts = await Promise.all(ICO_SIZES.map(render));
await writeFile(path.join(ASSETS, 'icon.ico'), await pngToIco(icoParts));

// Linux: a 512 master, plus a themed directory electron-builder can install.
await writeFile(path.join(ASSETS, 'icon.png'), await render(512));

const iconsDir = path.join(ASSETS, 'icons');
await mkdir(iconsDir, { recursive: true });
for (const size of LINUX_SIZES) {
  await writeFile(path.join(iconsDir, `${size}x${size}.png`), await render(size));
}

console.log(
  `icons written: icon.ico (${ICO_SIZES.join(', ')}), icon.png (512), ` +
    `icons/ (${LINUX_SIZES.join(', ')})`,
);
