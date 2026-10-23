// WCAG contrast check for every background/foreground token pair, in light and dark.
// Run: npm run check:theme  (reads scripts/theme-tokens.json). Text pairs need 4.5:1.
import { readFileSync } from "node:fs";

const T = JSON.parse(readFileSync(new URL("./theme-tokens.json", import.meta.url), "utf8"));

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const tok = (mode) => {
  const t = {};
  for (const [k, v] of Object.entries(T.core)) t[k] = v[mode];
  for (const [k, v] of Object.entries(T.pairs)) {
    t[`${k}-bg`] = v[mode === 0 ? 0 : 2];
    t[`${k}-fg`] = v[mode === 0 ? 1 : 3];
  }
  return t;
};

const SURFACES = ["bg", "surface", "surface-2", "surface-accent", "surface-accent-2", "popover"];
let fails = 0;
for (const [mode, name] of [[0, "light"], [1, "dark"]]) {
  const t = tok(mode);
  const pairs = [];
  for (const s of SURFACES) {
    pairs.push([s, "text", 4.5], [s, "text-muted", 4.5], [s, "accent-text", 4.5], [s, "accent-2-text", 4.5]);
    for (const k of ["success", "warning", "danger", "info", "violet"]) pairs.push([s, `${k}-fg`, 4.5]);
  }
  pairs.push(["surface-inverse", "text-inverse", 4.5], ["surface-inverse", "text-inverse-muted", 4.5],
    ["surface-inverse", "info-on-inverse", 4.5], ["surface-inverse", "warning-on-inverse", 4.5],
    ["primary", "primary-fg", 4.5], ["accent-2", "accent-fg", 4.5],
    ["danger-solid", "danger-solid-fg", 4.5], ["warning-solid", "warning-solid-fg", 4.5], ["success-solid", "success-solid-fg", 4.5],
    ["danger-solid-fg", "danger-solid", 4.5],
    ["input-bg", "text", 4.5], ["input-bg", "placeholder", 3],
    ["surface", "star", 3], ["surface", "border", 1.2], ["input-bg", "input-border", 1.5]);
  for (const k of Object.keys(T.pairs)) {
    pairs.push([`${k}-bg`, `${k}-fg`, 4.5], [`${k}-bg`, "text", 4.5]);
  }
  for (const [bg, fg, min] of pairs) {
    if (!(bg in t) || !(fg in t)) { console.log(`missing token ${bg} / ${fg}`); fails++; continue; }
    const r = ratio(t[bg], t[fg]);
    if (r < min) {
      fails++;
      console.log(`FAIL ${name}: ${fg} (${t[fg]}) on ${bg} (${t[bg]}) = ${r.toFixed(2)} (needs ${min})`);
    }
  }
}
if (fails) {
  console.log(`\n${fails} contrast problem(s).`);
  process.exit(1);
}
console.log("check:theme-contrast OK, all token pairs meet WCAG in light and dark.");
