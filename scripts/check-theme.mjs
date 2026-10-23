// Guard for the theme system. Run: npm run check:theme
//  1. no raw Tailwind palette colours (bg-white, text-slate-500, border-amber-200, ...) in src/
//  2. no hex / rgb / hsl colours in components (colours live in scripts/theme-tokens.json)
//  3. a *-bg token is never combined with a different token's *-fg on the same line
// WCAG contrast of every token pair is checked by scripts/check-theme-contrast.mjs.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SKIP = [/[\\/]lib[\\/]email[\\/]/, /icon\.svg$/];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

const HUES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_CLASS = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|shadow|from|to|via|divide|accent|decoration|outline|placeholder|caret)-(?:(?:${HUES})-\\d{2,3}|white|black)(?![\\w-])`,
  "g",
);
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
const PAIR = /\b(?:bg|text)-((?:cat|prio)-[a-z-]+?|success|warning|danger|info|violet|neutral)-(bg|fg)\b/g;

let problems = 0;
const report = (f, i, msg, line) => {
  problems++;
  console.log(`${relative(join(root, ".."), f)}:${i + 1}  ${msg}\n    ${line.trim().slice(0, 150)}`);
};

for (const f of walk(root)) {
  if (SKIP.some((r) => r.test(f))) continue;
  const isCss = f.endsWith(".css");
  readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (line.includes("theme-ok")) return;
    for (const m of line.matchAll(RAW_CLASS)) report(f, i, `raw palette class "${m[0]}"`, line);
    if (!isCss && RAW_COLOR.test(line.replace(/\/\/.*$/, ""))) report(f, i, "hard-coded colour value", line);
    if (!isCss) {
      // bg/fg pairing is checked per string literal (a line may hold several variants of a ternary)
      for (const lit of line.matchAll(/(["'`])((?:(?!\1).)*)\1/g)) {
        const bgs = new Set(), fgs = new Set();
        for (const m of lit[2].matchAll(PAIR)) {
          if (m[2] === "bg" && m[0].startsWith("bg-")) bgs.add(m[1]);
          if (m[2] === "fg" && m[0].startsWith("text-")) fgs.add(m[1]);
        }
        for (const bg of bgs) for (const fg of fgs) if (bg !== fg) report(f, i, `bg-${bg}-bg paired with text-${fg}-fg`, line);
      }
    }
  });
}

if (problems) {
  console.log(`\n${problems} theme problem(s).`);
  process.exit(1);
}
console.log("check:theme OK, no raw colours, no mismatched bg/fg pairs.");
