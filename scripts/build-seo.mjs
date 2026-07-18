#!/usr/bin/env node
// Generates the crawlable SEO surface at deploy time (same pattern as
// build-stubs.mjs — the SPA itself is hash-routed, so search engines only see
// one page without this):
//
//   c/<slug>.html — static, indexable category pages for every category with
//                   at least MIN_ENTRIES providers. Real content: provider
//                   names, mention counts, neighbor quotes, contacts, plus
//                   ItemList/BreadcrumbList JSON-LD. Each links into the SPA
//                   for the interactive experience (via=cat for attribution).
//   sitemap.xml   — home + category pages, lastmod from category activity.
//   robots.txt    — points crawlers at the sitemap. /e/ share stubs stay
//                   crawlable on purpose so their noindex tag is seen.
//
// Usage: node scripts/build-seo.mjs [outDir]
//   outDir defaults to the repo root (c/, sitemap.xml, robots.txt are
//   gitignored). The deploy workflow runs it against the staged _site/.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://losaltos.space";
const OG_IMAGE = SITE + "/og-image.png";

// Categories below this many providers don't get a page: thin doorway pages
// hurt more than they help.
export const MIN_ENTRIES = 3;

// keep these in sync with the helpers in index.html / build-stubs.mjs
export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function titleCase(s) {
  return String(s).replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; }
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

// all categories an entry belongs to (v1.1 `categories`, primary first)
function entryCats(e) {
  return (e.categories && e.categories.length) ? e.categories : [e.category];
}

function entriesForCat(entries, slug) {
  return (entries || [])
    .filter((e) => entryCats(e).map(slugify).includes(slug))
    .sort((a, b) =>
      (b.mention_count || 0) - (a.mention_count || 0) ||
      String(b.last_seen || "").localeCompare(String(a.last_seen || "")));
}

function pageCats(categories) {
  return (categories || [])
    .filter((c) => (c.entry_count || 0) >= MIN_ENTRIES)
    .sort((a, b) => (b.entry_count || 0) - (a.entry_count || 0) || a.name.localeCompare(b.name));
}

function catUrl(slug) {
  return `${SITE}/c/${encodeURIComponent(slug)}.html`;
}

function metaDescription(cat, list) {
  const names = list.slice(0, 3).map(displayName).join(", ");
  return truncate(
    `${list.length} ${cat.name.toLowerCase()} providers recommended by neighbors ` +
    `in a Los Altos, CA community group — including ${names}. Real quotes, ` +
    `updated daily.`, 160);
}

function jsonLd(cat, list, url) {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Neighbor-recommended ${cat.name.toLowerCase()} in Los Altos, CA`,
    url,
    numberOfItems: list.length,
    itemListElement: list.map((e, i) => {
      const biz = { "@type": "LocalBusiness", name: displayName(e) };
      const phones = (e.contact && e.contact.phones) || [];
      const sites = (e.contact && e.contact.websites) || [];
      if (phones.length) biz.telephone = phones[0];
      if (sites.length) biz.url = sites[0];
      biz.areaServed = "Los Altos, CA";
      return { "@type": "ListItem", position: i + 1, item: biz };
    }),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Los Altos List", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: titleCase(cat.name), item: url },
    ],
  };
  return [itemList, breadcrumb];
}

function providerHtml(e, catSlug) {
  const name = displayName(e);
  const deepLink = `/#${new URLSearchParams({ c: slugify(e.category), e: e.id, via: "cat" })}`;
  const count = e.mention_count || (e.mentions ? e.mentions.length : 0);
  const quotes = (e.mentions || [])
    .filter((m) => m.quote)
    .slice(0, 2)
    .map((m) =>
      `<blockquote>“${esc(truncate(m.quote, 240))}”` +
      (m.by ? ` <cite>— ${esc(m.by)}${m.date ? ", " + esc(m.date) : ""}</cite>` : "") +
      `</blockquote>`)
    .join("\n      ");
  const phones = ((e.contact && e.contact.phones) || [])
    .map((p) => `<a href="tel:${esc(String(p).replace(/[^+\d]/g, ""))}">${esc(p)}</a>`);
  const sites = ((e.contact && e.contact.websites) || [])
    .map((w) => `<a href="${esc(w)}" rel="nofollow noopener">${esc(hostname(w))}</a>`);
  const contacts = phones.concat(sites);
  const also = entryCats(e).map(slugify).filter((s) => s !== catSlug);

  return `  <article>
      <h2><a href="${esc(deepLink)}">${esc(name)}</a></h2>
      <p class="meta">★ ${count} neighbor mention${count === 1 ? "" : "s"}${
        contacts.length ? " · " + contacts.join(" · ") : ""}${
        also.length ? " · also under " + esc(also.map(titleCase).join(", ")) : ""}</p>
      ${quotes}
    </article>`;
}

export function categoryHtml(cat, entries, categories) {
  const list = entriesForCat(entries, cat.slug);
  const url = catUrl(cat.slug);
  const catName = titleCase(cat.name);
  const title = `${list.length} Neighbor-Recommended ${catName} Providers in Los Altos, CA`;
  const desc = metaDescription(cat, list);
  const others = pageCats(categories).filter((c) => c.slug !== cat.slug);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} · Los Altos List</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Los Altos List" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${esc(OG_IMAGE)}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">
${JSON.stringify(jsonLd(cat, list, url), null, 1)}
</script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 44rem; margin: 0 auto; padding: 1.5rem; line-height: 1.55; color: #222; }
  a { color: #0b57d0; }
  h1 { line-height: 1.2; }
  article { border-top: 1px solid #e5e5e5; padding: 1rem 0; }
  .meta { color: #555; font-size: 0.95rem; }
  blockquote { margin: 0.5rem 0 0.5rem 1rem; color: #333; }
  cite { color: #777; font-style: normal; font-size: 0.9rem; }
  footer, .about { color: #555; font-size: 0.95rem; }
  .allcats a { white-space: nowrap; }
</style>
</head>
<body>
<header>
  <p><a href="/">← Los Altos List</a></p>
  <h1>${esc(catName)} in Los Altos, recommended by neighbors</h1>
  <p class="about">${list.length} provider${list.length === 1 ? "" : "s"} shared in a Los Altos
  community WhatsApp group, in neighbors' own words. No ads, no pay-to-play —
  updated daily${cat.last_activity ? `, last activity ${esc(cat.last_activity)}` : ""}.
  <a href="/#${esc(new URLSearchParams({ c: cat.slug, via: "cat" }).toString())}">Browse the interactive directory →</a></p>
</header>
<main>
${list.map((e) => providerHtml(e, cat.slug)).join("\n")}
</main>
<footer>
  <p class="allcats">More Los Altos recommendations: ${others
    .map((c) => `<a href="/c/${encodeURIComponent(c.slug)}.html">${esc(titleCase(c.name))}</a>`)
    .join(" · ")}</p>
  <p>Community-sourced directory · <a href="/">losaltos.space</a> ·
     <a href="https://github.com/thesharmas/losaltoslist">open data</a></p>
</footer>
</body>
</html>
`;
}

export function sitemapXml(categories, meta) {
  const today = String((meta && meta.generated_at) || "").slice(0, 10);
  const urls = [{ loc: SITE + "/", lastmod: today }].concat(
    pageCats(categories).map((c) => ({
      loc: catUrl(c.slug),
      lastmod: String(c.last_activity || today).slice(0, 10),
    })));
  const body = urls
    .map((u) =>
      `  <url>\n    <loc>${esc(u.loc)}</loc>` +
      (u.lastmod ? `\n    <lastmod>${esc(u.lastmod)}</lastmod>` : "") +
      `\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

export function buildSeo(entries, categories, meta, outDir) {
  const cats = pageCats(categories);
  const dir = join(outDir, "c");
  mkdirSync(dir, { recursive: true });

  let written = 0;
  const skipped = [];
  for (const cat of cats) {
    // slugs are pipeline-generated; refuse anything that could escape the
    // output dir rather than trying to sanitize it.
    if (!cat.slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(cat.slug)) {
      skipped.push(cat.slug || "(missing slug)");
      continue;
    }
    writeFileSync(join(dir, `${cat.slug}.html`), categoryHtml(cat, entries, categories));
    written++;
  }
  writeFileSync(join(outDir, "sitemap.xml"), sitemapXml(categories, meta));
  writeFileSync(join(outDir, "robots.txt"), robotsTxt());
  return { written, skipped };
}

// ---- CLI ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] || ROOT);
  const entries = JSON.parse(readFileSync(join(ROOT, "data", "entries.json"), "utf8"));
  const categories = JSON.parse(readFileSync(join(ROOT, "data", "categories.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(ROOT, "data", "meta.json"), "utf8"));
  const { written, skipped } = buildSeo(entries, categories, meta, outDir);
  console.log(`seo surface: wrote ${written} category pages + sitemap.xml + robots.txt to ${outDir}`);
  if (skipped.length) console.warn(`skipped ${skipped.length} categories with unusable slugs: ${skipped.join(", ")}`);
}
