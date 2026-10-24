// Renders the PWA icons from the logo in src/app/icon.svg. Run: node scripts/build-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const logo = readFileSync(new URL("../src/app/icon.svg", import.meta.url));
const BG = "#F8FAFC";

async function icon(file, size, logoScale) {
  const inner = Math.round(size * logoScale);
  const mark = await sharp(logo, { density: 600 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(new URL(`../public/icons/${file}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}

await icon("icon-192.png", 192, 0.78);
await icon("icon-512.png", 512, 0.78);
// Maskable: logo kept inside the central 80% "safe zone".
await icon("icon-maskable-512.png", 512, 0.6);
await icon("apple-touch-icon.png", 180, 0.74);
console.log("icons written");
