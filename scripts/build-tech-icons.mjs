// Generates public/tech/*.svg from tech.yaml using the bundled simple-icons
// package, so the logo carousel doesn't depend on cdn.simpleicons.org at
// runtime.
//
// Called from the techIcons() integration in astro.config.mjs, so it runs
// automatically on both `npm run dev` and `npm run build`. The output is
// gitignored — it's derived from tech.yaml and shouldn't be committed.
//
// Icons are written as individual files rather than inlined into the page:
// a <symbol> sprite of all ~92 paths adds ~49 kB gzipped to the home page,
// while these are same-origin, individually cacheable and lazy-loaded.
//
// A slug with no matching icon is NOT fatal — the carousel falls back to a
// text pill for it. The warning below is what keeps that from being silent.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { parse } from 'yaml';
import * as simpleIcons from 'simple-icons';

const OUT_DIR = 'public/tech';

export function buildTechIcons({ quiet = false } = {}) {
  // index every export by its own slug — the si* export names don't map from
  // slugs by a rule we'd want to reimplement
  const bySlug = new Map();
  for (const key of Object.keys(simpleIcons)) {
    const icon = simpleIcons[key];
    if (icon?.slug) bySlug.set(icon.slug, icon);
  }

  const logos = parse(readFileSync('src/content/tech.yaml', 'utf-8'));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const missing = [];
  const colorClash = [];
  const written = new Map(); // slug -> color already written

  for (const { name, slug, color } of logos) {
    const icon = bySlug.get(slug);
    if (!icon) {
      missing.push(`${name} (${slug})`);
      continue;
    }

    const prev = written.get(slug);
    if (prev && prev !== color) {
      // one file per slug, so a second colour for the same slug can't be honoured
      colorClash.push(`${name} (${slug}): keeping #${prev}, ignoring #${color}`);
      continue;
    }
    if (prev) continue;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">` +
      `<title>${icon.title}</title>` +
      `<path fill="#${color}" d="${icon.path}"/>` +
      `</svg>`;

    writeFileSync(`${OUT_DIR}/${slug}.svg`, svg);
    written.set(slug, color);
  }

  if (!quiet) console.log(`[tech-icons] wrote ${written.size} icons to ${OUT_DIR}/`);
  if (colorClash.length) {
    console.warn(`[tech-icons] duplicate slug with a different colour:\n  ${colorClash.join('\n  ')}`);
  }
  if (missing.length) {
    console.warn(
      `[tech-icons] no icon in simple-icons for:\n  ${missing.join('\n  ')}\n` +
      `  These render as text pills. If a slug is just wrong, check https://simpleicons.org`
    );
  }

  return { written: written.size, missing };
}

// also runnable directly: node scripts/build-tech-icons.mjs
if (import.meta.url === `file://${process.argv[1]}`) buildTechIcons();
