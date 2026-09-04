// Generate the PWA icon set from the existing public/favicon.svg.
//
// Why a script (and not a build step):
//   - The output is committed. CI never needs sharp.
//   - The script is idempotent: re-run any time the favicon changes.
//   - Sharp is a devDependency only, so production install cost is unchanged.
//
// Outputs (all PNG):
//   public/icons/icon-192.png         - 192x192, used by Android install / PWA manifest
//   public/icons/icon-512.png         - 512x512, used by Android splash / PWA install dialog
//   public/icons/icon-512-maskable.png- 512x512 with 20% safe zone, used by Android adaptive icons
//   public/icons/apple-touch-icon.png - 180x180, used by iOS "Add to Home Screen"
//
// Run:    node scripts/generate-icons.mjs

import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SVG_PATH = resolve(ROOT, "public/favicon.svg");
const ICON_DIR = resolve(ROOT, "public/icons");

/**
 * Wrap the existing favicon SVG in a new SVG of the requested size with
 * the requested padding (fraction of one side). This lets us produce a
 * maskable-safe icon: Android will crop a circle/squircle/rounded-rect
 * over the icon, and the inner 60% is the only guaranteed-visible area.
 *
 * The favicon.svg is a hand-built three-bar logo on a 64x64 canvas, so
 * we just place it centered inside the new viewBox.
 */
function wrapSvg(innerSvg, size, paddingFraction) {
  const pad = Math.round(size * paddingFraction);
  const inner = size - 2 * pad;
  // Strip the outer <svg> tags from the favicon so we can embed it as
  // a nested <svg>. This avoids issues with conflicting xmlns / viewBox.
  const stripped = innerSvg.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <svg width="${inner}" height="${inner}" x="${pad}" y="${pad}" viewBox="0 0 64 64">
    ${stripped}
  </svg>
</svg>`;
}

const targets = [
  { out: "icon-192.png",          size: 192, padding: 0.0 },
  { out: "icon-512.png",          size: 512, padding: 0.0 },
  { out: "icon-512-maskable.png", size: 512, padding: 0.2 },
  { out: "apple-touch-icon.png",  size: 180, padding: 0.0 },
];

await mkdir(ICON_DIR, { recursive: true });

const svg = await readFile(SVG_PATH, "utf8");

for (const t of targets) {
  const wrapped = wrapSvg(svg, t.size, t.padding);
  const out = resolve(ICON_DIR, t.out);
  await sharp(Buffer.from(wrapped)).png().toFile(out);
  console.log(`wrote ${out}`);
}

console.log("done.");
