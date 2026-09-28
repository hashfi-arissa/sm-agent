// Regenerates every icon from apps/desktop/assets/icon.svg:
//   apps/desktop/assets/icon.ico   16–256 px, installer + exe
//   apps/desktop/assets/icon.png   512 px, unpackaged dev window
//   apps/app/src/app/favicon.ico   16/32/48 px
//   apps/landing/public/favicon.ico + favicon.svg
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

const desktopDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const source = path.join(desktopDir, "assets", "icon.svg");
const svg = readFileSync(source);

/** Renders the SVG at `size` px, supersampled for crisp edges. */
function render(size) {
  return sharp(svg, { density: 72 * (size / 256) * 4 })
    .resize(size, size)
    .png()
    .toBuffer();
}

/** Packs PNG images into a .ico (PNG-compressed entries, Vista+). */
async function ico(sizes) {
  const pngs = await Promise.all(sizes.map(render));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

function write(file, data) {
  writeFileSync(file, data);
  console.log(`✓ ${path.relative(repoRoot, file)}`);
}

write(
  path.join(desktopDir, "assets", "icon.ico"),
  await ico([16, 24, 32, 48, 64, 128, 256]),
);
write(path.join(desktopDir, "assets", "icon.png"), await render(512));

const favicon = await ico([16, 32, 48]);
write(path.join(repoRoot, "apps", "app", "src", "app", "favicon.ico"), favicon);
write(path.join(repoRoot, "apps", "landing", "public", "favicon.ico"), favicon);

const landingSvg = path.join(
  repoRoot,
  "apps",
  "landing",
  "public",
  "favicon.svg",
);
copyFileSync(source, landingSvg);
console.log(`✓ ${path.relative(repoRoot, landingSvg)}`);
