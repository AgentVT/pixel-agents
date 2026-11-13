/**
 * Import a character rendered by agent-sprite-forge (codeart2d PixelSpec route)
 * into the Pixel Agents character sheet format.
 *
 * Input: a render_pixelspec.py output folder containing codeart-meta.json and
 * <variant>/frames/*.png. The spec must name its frames `<direction>-<frame>`:
 *   direction: down, up, right
 *   frame:     walk1, walk2, walk3, type1, type2, read1, read2
 *
 * Output: one 112×96 PNG (7 frames × 16px wide, 3 direction rows × 32px tall),
 * the same layout scripts/export-characters.ts writes. Frames smaller than
 * 16×32 are bottom-center aligned in their cell. Larger frames are rejected;
 * this script never resamples pixel art.
 *
 * Run: npx tsx scripts/import-forge-character.ts <forge-output-dir> <variant> <out.png>
 * Example spec: scripts/forge/hoodie.pixelspec.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

const FRAME_W = 16;
const FRAME_H = 32;
const DIRECTIONS = ['down', 'up', 'right'] as const;
const FRAME_NAMES = ['walk1', 'walk2', 'walk3', 'type1', 'type2', 'read1', 'read2'] as const;
const META_FILE = 'codeart-meta.json';
const BYTES_PER_PIXEL = 4;

interface ForgeFrame {
  name: string;
  file: string;
}

interface ForgeMeta {
  pixelspec?: {
    frames?: ForgeFrame[];
    variants?: Record<string, string>;
  };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const [forgeDir, variant, outPath] = process.argv.slice(2);
if (!forgeDir || !variant || !outPath) {
  console.error(
    'usage: npx tsx scripts/import-forge-character.ts <forge-output-dir> <variant> <out.png>',
  );
  process.exit(2);
}

const metaPath = path.join(forgeDir, META_FILE);
if (!fs.existsSync(metaPath)) fail(`${metaPath} not found`);
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as ForgeMeta;

const variantDir = meta.pixelspec?.variants?.[variant];
if (!variantDir) {
  const known = Object.keys(meta.pixelspec?.variants ?? {}).join(', ');
  fail(`variant "${variant}" not in ${META_FILE} (found: ${known || 'none'})`);
}

// Frames that render identical pixels share one file, so resolve every name through the metadata.
const fileByName = new Map<string, string>();
for (const frame of meta.pixelspec?.frames ?? []) {
  fileByName.set(frame.name, frame.file);
}

const sheet = new PNG({ width: FRAME_W * FRAME_NAMES.length, height: FRAME_H * DIRECTIONS.length });

for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
  for (let f = 0; f < FRAME_NAMES.length; f++) {
    const name = `${DIRECTIONS[dirIdx]}-${FRAME_NAMES[f]}`;
    const file = fileByName.get(name);
    if (!file) fail(`frame "${name}" missing from ${META_FILE}`);

    const framePath = path.join(forgeDir, variantDir, file);
    const frame = PNG.sync.read(fs.readFileSync(framePath));
    if (frame.width > FRAME_W || frame.height > FRAME_H) {
      fail(`${framePath} is ${frame.width}×${frame.height}; the cell is ${FRAME_W}×${FRAME_H}`);
    }

    const cellX = f * FRAME_W + Math.floor((FRAME_W - frame.width) / 2);
    const cellY = dirIdx * FRAME_H + (FRAME_H - frame.height);
    for (let y = 0; y < frame.height; y++) {
      const src = y * frame.width * BYTES_PER_PIXEL;
      const dst = ((cellY + y) * sheet.width + cellX) * BYTES_PER_PIXEL;
      frame.data.copy(sheet.data, dst, src, src + frame.width * BYTES_PER_PIXEL);
    }
  }
}

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, PNG.sync.write(sheet));
console.log(`✓ Wrote ${outPath} (${sheet.width}×${sheet.height}, variant ${variant})`);
