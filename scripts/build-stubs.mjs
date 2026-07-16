#!/usr/bin/env node
// Generates a static share-stub page per directory entry (e/<id>.html) so a
// shared card link gets its own OpenGraph preview in WhatsApp/iMessage/Slack.
// Chat-app crawlers don't execute JS, so the SPA hash URL (#e=<id>) always
// previews as the generic site card; these stubs carry per-entry meta tags and
// instantly redirect humans to the real card on the main page.
//
// Usage: node scripts/build-stubs.mjs [outDir]
//   outDir defaults to the repo root (writes ./e/<id>.html — gitignored).
//   The deploy workflow runs it against the staged _site/ directory.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://losaltos.space";
const OG_IMAGE = SITE + "/og-image.png";

// keep these in sync with the helpers in index.html
export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; }
}

function titleCase(s) {
  return String(s).replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));
}

function displayName(e) {
  if (e.name) return e.name;
  const sites = (e.contact && e.contact.websites) || [];
  if (sites.length) return hostname(sites[0]);
  return "A recommended " + String(e.category || "provider").toLowerCase();
}

function truncate(s, n) {
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function description(e) {
  const count = e.mention_count || (e.mentions ? e.mentions.length : 0);
  const lead = count > 1
    ? `★ Recommended by ${count} neighbors in a Los Altos group.`
    : "Recommended by a neighbor in a Los Altos group.";
  const first = (e.mentions && e.mentions[0] && e.mentions[0].quote) || "";
  return truncate(first ? `${lead} “${first}”` : lead, 200);
}

export function stubHtml(entry, catName) {
  const name = displayName(entry);
  const title = `${name} — ${titleCase(catName)} · Los Altos List`;
  const desc = description(entry);
  const target = `/#${new URLSearchParams({ c: slugify(entry.category), e: entry.id })}`;
  const stubUrl = `${SITE}/e/${encodeURIComponent(entry.id)}.html`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="noindex" />
<link rel="canonical" href="${esc(SITE + "/")}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Los Altos List" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(stubUrl)}" />
<meta property="og:image" content="${esc(OG_IMAGE)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(OG_IMAGE)}" />
<meta http-equiv="refresh" content="0;url=${esc(target)}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p>Taking you to <a href="${esc(target)}">${esc(title)}</a>…</p>
</body>
</html>
`;
}

export function buildStubs(entries, categories, outDir) {
  const catBySlug = {};
  for (const c of categories || []) catBySlug[c.slug] = c;

  const dir = join(outDir, "e");
  mkdirSync(dir, { recursive: true });

  let written = 0;
  const skipped = [];
  for (const entry of entries || []) {
    // ids are pipeline-generated slugs; refuse anything that could escape the
    // output dir or break a URL rather than trying to sanitize it.
    if (!entry.id || !/^[a-z0-9][a-z0-9_-]*$/i.test(entry.id)) {
      skipped.push(entry.id || "(missing id)");
      continue;
    }
    const cat = catBySlug[slugify(entry.category)];
    writeFileSync(join(dir, `${entry.id}.html`), stubHtml(entry, cat ? cat.name : String(entry.category || "")));
    written++;
  }
  return { written, skipped };
}

// ---- CLI ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] || ROOT);
  const entries = JSON.parse(readFileSync(join(ROOT, "data", "entries.json"), "utf8"));
  const categories = JSON.parse(readFileSync(join(ROOT, "data", "categories.json"), "utf8"));
  const { written, skipped } = buildStubs(entries, categories, outDir);
  console.log(`share stubs: wrote ${written} pages to ${join(outDir, "e")}`);
  if (skipped.length) console.warn(`skipped ${skipped.length} entries with unusable ids: ${skipped.join(", ")}`);
}
