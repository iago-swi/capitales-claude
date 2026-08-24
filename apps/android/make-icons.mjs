/**
 * Renders the Android launcher icons.
 *
 * Three sets, because Android asks for three different things:
 *
 * - `ic_launcher_foreground` — the adaptive-icon layer, transparent, drawn at
 *   108dp. The launcher masks and parallaxes it, so the marker sits well inside
 *   a safe zone rather than filling the canvas.
 * - `ic_launcher` / `ic_launcher_round` — the legacy 48dp icons, still used by
 *   launchers and dialogs on older devices. These get the full artwork,
 *   background included.
 * - the background colour, which the adaptive icon composites underneath.
 *
 * Below 48dp the detailed marker turns to mud, so the legacy icons reuse the
 * simplified drawing from the desktop build for the same reason it exists
 * there.
 */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RES = path.join(HERE, 'android', 'app', 'src', 'main', 'res');
const DESKTOP_ASSETS = path.resolve(HERE, '..', 'desktop', 'assets');

const BACKGROUND = '#0a1628';

/** Android density buckets: legacy launcher is 48dp, adaptive layers are 108dp. */
const DENSITIES = [
  { dir: 'mdpi', legacy: 48, adaptive: 108 },
  { dir: 'hdpi', legacy: 72, adaptive: 162 },
  { dir: 'xhdpi', legacy: 96, adaptive: 216 },
  { dir: 'xxhdpi', legacy: 144, adaptive: 324 },
  { dir: 'xxxhdpi', legacy: 192, adaptive: 432 },
];

/** Below this the detailed drawing stops being legible. */
const SIMPLIFY_BELOW = 96;

const detailed = await readFile(path.join(DESKTOP_ASSETS, 'icon.svg'));
const simple = await readFile(path.join(DESKTOP_ASSETS, 'icon-small.svg'));
const foreground = await readFile(path.join(HERE, 'assets', 'icon-foreground.svg'));

const render = (svg, size) =>
  sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

for (const { dir, legacy, adaptive } of DENSITIES) {
  const out = path.join(RES, `mipmap-${dir}`);
  await mkdir(out, { recursive: true });

  const art = legacy < SIMPLIFY_BELOW ? simple : detailed;
  const square = await render(art, legacy);

  await writeFile(path.join(out, 'ic_launcher.png'), square);
  // Same artwork: it already reads as a disc, and the launcher masks it anyway.
  await writeFile(path.join(out, 'ic_launcher_round.png'), square);
  await writeFile(
    path.join(out, 'ic_launcher_foreground.png'),
    await render(foreground, adaptive),
  );
}

await writeFile(
  path.join(RES, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BACKGROUND}</color>\n</resources>\n`,
  'utf8',
);

console.log(
  `android icons written for ${DENSITIES.map((d) => d.dir).join(', ')}; ` +
    `adaptive background ${BACKGROUND}`,
);
