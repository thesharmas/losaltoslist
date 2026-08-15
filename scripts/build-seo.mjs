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
// data/seo-overrides.json (optional) supplies per-category <title> /
// meta-description overrides. It is maintained by the weekly SEO learner
// (Search Console CTR experiments) and, like synonyms.json, is NOT written
// by the daily data export. Keys starting with _ are ignored.
//
// Usage: node scripts/build-seo.mjs [outDir]
//   outDir defaults to the repo root (c/, sitemap.xml, robots.txt are
//   gitignored). The deploy workflow runs it against the staged _site/.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://losaltos.space";
const OG_IMAGE = SITE + "/og-image.png?v=2";

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

// PostHog for the generated static pages. These are the pages search engines
// actually rank, so without this the whole SEO surface is a black box: no way
// to tell a page that ranks and converts from one that ranks and bounces.
// Same project key as index.html (it is a public, write-only ingest key).
const POSTHOG_KEY = "phc_qk3Ja3MuPuWTua2wjxgfeBxvRTxP3DRdrimTueAFQcgs";
const POSTHOG_HOST = "https://us.i.posthog.com";

function analyticsSnippet(surface) {
  return `<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('${POSTHOG_KEY}', { api_host: '${POSTHOG_HOST}', person_profiles: 'always' });
  posthog.register({ site: 'losaltos.space', surface: '${surface}' });
</script>`;
}

// Renders the data-* attributes analyticsWiring() reads back. Underscored keys
// become dashed attributes and round-trip to snake_case props, so an event
// fired here is directly comparable to the same event fired in index.html.
//
// Only pass things that belong in analytics: index.html deliberately keeps
// phone numbers and email addresses out of contact_clicked, and anything put
// in a data-* attribute here would be sent.
export function trackAttrs(name, props) {
  let out = ` data-track="${esc(name)}"`;
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === "") continue;
    out += ` data-${k.replace(/_/g, "-")}="${esc(v)}"`;
  }
  return out;
}

// Wires outbound + hand-off clicks on a generated page. Kept dependency-free
// and defensive: analytics must never throw into a static page.
function analyticsWiring() {
  return `<script>
  (function () {
    function track(name, props) {
      try {
        if (window.posthog && typeof window.posthog.capture === "function") {
          window.posthog.capture(name, props || {});
        }
      } catch (e) { /* analytics never throws into the page */ }
    }
    // dataset keys arrive camelCased ("eventId"); the app fires snake_case
    // ("event_id"), and the two surfaces have to be comparable in PostHog.
    function snake(s) { return s.replace(/[A-Z]/g, function (c) { return "_" + c.toLowerCase(); }); }
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest && ev.target.closest("a[data-track]");
      if (!a) return;
      var props = {};
      for (var k in a.dataset) {
        if (k !== "track" && a.dataset[k] !== "") props[snake(k)] = a.dataset[k];
      }
      track(a.dataset.track, props);
    });
  })();
</script>`;
}

// JSON.stringify leaves "<" alone, so a provider name or event title holding
// "</script>" would close the JSON-LD block early and inject markup. Escaping
// "<" as < is still valid JSON — it parses back to the original string.
export function jsonLdScript(value) {
  return JSON.stringify(value, null, 1).replace(/</g, "\\u003c");
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

// Per-category title/description overrides (seo-overrides.json). Shape is
// validated by the learner before commit; here we just guard the basics so a
// bad file can never break the build.
export function loadOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [slug, v] of Object.entries(raw)) {
    if (slug.startsWith("_") || !v || typeof v !== "object") continue;
    const o = {};
    if (typeof v.title === "string" && v.title.trim()) o.title = v.title.trim();
    if (typeof v.description === "string" && v.description.trim()) o.description = v.description.trim();
    if (Object.keys(o).length) out[slug] = o;
  }
  return out;
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
      (m.date ? ` <cite>— a neighbor, ${esc(m.date)}</cite>` : " <cite>— a neighbor</cite>") +
      `</blockquote>`)
    .join("\n      ");
  // the number itself never reaches analytics — only that a phone was clicked
  const phones = ((e.contact && e.contact.phones) || [])
    .map((p) => `<a href="tel:${esc(String(p).replace(/[^+\d]/g, ""))}"${
      trackAttrs("contact_clicked", {
        method: "phone", business: name, category: catSlug, surface: "category_page",
      })}>${esc(p)}</a>`);
  const sites = ((e.contact && e.contact.websites) || [])
    .map((w) => `<a href="${esc(w)}" rel="nofollow noopener"${
      trackAttrs("contact_clicked", {
        method: "website", business: name, category: catSlug,
        url: w, surface: "category_page",
      })}>${esc(hostname(w))}</a>`);
  const contacts = phones.concat(sites);
  const also = entryCats(e).map(slugify).filter((s) => s !== catSlug);

  return `  <article>
      <h2><a href="${esc(deepLink)}"${trackAttrs("seo_handoff", {
        target: "provider", entry_id: e.id, category: catSlug, surface: "category_page",
      })}>${esc(name)}</a></h2>
      <p class="meta">★ ${count} neighbor mention${count === 1 ? "" : "s"}${
        contacts.length ? " · " + contacts.join(" · ") : ""}${
        also.length ? " · also under " + esc(also.map(titleCase).join(", ")) : ""}</p>
      ${quotes}
    </article>`;
}

export function categoryHtml(cat, entries, categories, overrides) {
  const list = entriesForCat(entries, cat.slug);
  const url = catUrl(cat.slug);
  const catName = titleCase(cat.name);
  const o = (overrides && overrides[cat.slug]) || {};
  const title = o.title || `${list.length} Neighbor-Recommended ${catName} Providers in Los Altos, CA`;
  const desc = o.description || metaDescription(cat, list);
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
${jsonLdScript(jsonLd(cat, list, url))}
</script>
${analyticsSnippet("category_page")}
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
  <p><a href="/"${trackAttrs("seo_handoff", { target: "home", surface: "category_page" })}>← Los Altos List</a></p>
  <h1>${esc(catName)} in Los Altos, recommended by neighbors</h1>
  <p class="about">${list.length} provider${list.length === 1 ? "" : "s"} shared in a Los Altos
  community WhatsApp group, in neighbors' own words. No ads, no pay-to-play —
  updated daily${cat.last_activity ? `, last activity ${esc(cat.last_activity)}` : ""}.
  <a href="/#${esc(new URLSearchParams({ c: cat.slug, via: "cat" }).toString())}"${
    trackAttrs("seo_handoff", { target: "directory", category: cat.slug, surface: "category_page" })
  }>Browse the interactive directory →</a></p>
</header>
<main>
${list.map((e) => providerHtml(e, cat.slug)).join("\n")}
</main>
<footer>
  <p class="allcats">More Los Altos recommendations: ${others
    .map((c) => `<a href="/c/${encodeURIComponent(c.slug)}.html"${
      trackAttrs("seo_internal_link", {
        from_category: cat.slug, to_category: c.slug, surface: "category_page",
      })}>${esc(titleCase(c.name))}</a>`)
    .join(" · ")}</p>
  <p>Community-sourced directory · <a href="/"${
     trackAttrs("seo_handoff", { target: "home", surface: "category_page" })}>losaltos.space</a> ·
     <a href="https://github.com/thesharmas/losaltoslist"${
     trackAttrs("seo_outbound", { target: "github", surface: "category_page" })}>open data</a></p>
</footer>
${analyticsWiring()}
</body>
</html>
`;
}

// ---- events -------------------------------------------------------------
// The events pane lives behind #view=events, so like the category pages it
// needs a static twin. Events also unlock a rich result the directory can't
// get: Google renders schema.org/Event with dates directly in search.

// Not every posting is a Los Altos event — the group shares Bay Area and even
// overseas ones. Locals lead the page; regional ones still get listed (with
// their true location in the markup) rather than being dropped.
const EV_RANK = { community: 0, local: 1, regional: 2 };

export function upcomingEvents(events, todayIso) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => {
      // an event is still upcoming through the end of its last day
      const end = String(e.end_date || e.start_date || "");
      return end >= todayIso;
    })
    .sort((a, b) =>
      (EV_RANK[a.kind] ?? 3) - (EV_RANK[b.kind] ?? 3) ||
      String(a.start_date || "").localeCompare(String(b.start_date || "")));
}

function eventJsonLd(e, url) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title || "Community event",
    startDate: e.start_date,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url: e.url || url,
  };
  if (e.end_date) ld.endDate = e.end_date;
  if (e.description) ld.description = truncate(e.description, 300);
  if (e.venue || e.city) {
    ld.location = {
      "@type": "Place",
      name: e.venue || e.city,
      address: { "@type": "PostalAddress", addressLocality: e.city || "Los Altos",
                 addressRegion: "CA", addressCountry: "US" },
    };
  }
  if (e.organizer) ld.organizer = { "@type": "Organization", name: e.organizer };
  // "Free" is the only cost string worth modelling; the rest are prose
  if (/^free$/i.test(String(e.cost || "").trim())) {
    ld.isAccessibleForFree = true;
    ld.offers = { "@type": "Offer", price: "0", priceCurrency: "USD",
                  availability: "https://schema.org/InStock", url: e.url || url };
  }
  return ld;
}

function eventArticle(e) {
  const when = [e.start_date, e.end_date && e.end_date !== e.start_date ? "– " + e.end_date : ""]
    .filter(Boolean).join(" ");
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  const bits = [e.time, e.recurrence, e.cost].filter(Boolean).map(esc).join(" · ");
  const href = e.url ? String(e.url) : null;
  return `  <article>
      <h2>${esc(e.title || "Community event")}</h2>
      <p class="meta"><time datetime="${esc(e.start_date || "")}">${esc(when)}</time>${
        bits ? " · " + bits : ""}${where ? " · " + esc(where) : ""}${
        e.organizer ? " · " + esc(e.organizer) : ""}</p>
      ${e.description ? `<p>${esc(e.description)}</p>` : ""}
      ${href ? `<p><a href="${esc(href)}" rel="nofollow noopener"${
        trackAttrs("event_link_opened", {
          event_id: e.id, kind: e.kind, surface: "events_page",
        })}>Event details ↗</a></p>` : ""}
    </article>`;
}

export function eventsHtml(eventsData, todayIso) {
  const url = SITE + "/events.html";
  const list = upcomingEvents(eventsData && eventsData.events, todayIso);
  const promos = (eventsData && Array.isArray(eventsData.promos)) ? eventsData.promos : [];
  const localCount = list.filter((e) => e.kind !== "regional").length;
  const title = `Things to Do Around Los Altos — ${list.length} Upcoming Community Events`;
  const desc = truncate(
    `${list.length} upcoming events shared by neighbors in a Los Altos, CA community ` +
    `group — ${localCount} in Los Altos and Los Altos Hills, plus nearby Bay Area ` +
    `happenings. Updated daily.`, 160);

  const ld = list.map((e) => eventJsonLd(e, url));
  ld.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Los Altos List", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "What's On", item: url },
    ],
  });

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
${jsonLdScript(ld)}
</script>
${analyticsSnippet("events_page")}
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 44rem; margin: 0 auto; padding: 1.5rem; line-height: 1.55; color: #222; }
  a { color: #0b57d0; }
  h1 { line-height: 1.2; }
  article { border-top: 1px solid #e5e5e5; padding: 1rem 0; }
  .meta { color: #555; font-size: 0.95rem; }
  footer, .about { color: #555; font-size: 0.95rem; }
</style>
</head>
<body>
<header>
  <p><a href="/"${trackAttrs("seo_handoff", { target: "home", surface: "events_page" })}>← Los Altos List</a></p>
  <h1>What's on around Los Altos</h1>
  <p class="about">${list.length} upcoming event${list.length === 1 ? "" : "s"} shared by
  neighbors in a Los Altos community WhatsApp group — no ads, no pay-to-play,
  updated daily. <a href="/#view=events&amp;via=events"${
    trackAttrs("seo_handoff", { target: "calendar", surface: "events_page" })
  }>Browse the interactive calendar →</a></p>
</header>
<main>
${list.map(eventArticle).join("\n")}
</main>
${promos.length ? `<section>
  <h2>Neighbors' own shops</h2>
  <p class="about">Local businesses neighbors run, as posted in the group.</p>
${promos.map((p) => `  <article>
      <h3>${esc(p.name || "A neighbor's business")}</h3>
      <p class="meta">${esc(p.what || "")}</p>
      ${p.description ? `<p>${esc(p.description)}</p>` : ""}
    </article>`).join("\n")}
</section>` : ""}
<footer>
  <p>Community-sourced directory · <a href="/"${
     trackAttrs("seo_handoff", { target: "home", surface: "events_page" })}>losaltos.space</a> ·
     <a href="https://github.com/thesharmas/losaltoslist"${
     trackAttrs("seo_outbound", { target: "github", surface: "events_page" })}>open data</a></p>
</footer>
${analyticsWiring()}
</body>
</html>
`;
}

export function sitemapXml(categories, meta, eventsData, todayIso) {
  const today = String((meta && meta.generated_at) || "").slice(0, 10);
  const urls = [{ loc: SITE + "/", lastmod: today }];
  // only list the events page when it actually has events on it
  if (eventsData && upcomingEvents(eventsData.events, todayIso || today).length) {
    urls.push({
      loc: SITE + "/events.html",
      lastmod: String((eventsData.meta && eventsData.meta.generated_at) || today).slice(0, 10),
    });
  }
  urls.push(...
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

export function buildSeo(entries, categories, meta, outDir, rawOverrides, eventsData, todayIso) {
  const cats = pageCats(categories);
  const dir = join(outDir, "c");
  mkdirSync(dir, { recursive: true });
  const overrides = loadOverrides(rawOverrides);
  const today = todayIso || String((meta && meta.generated_at) || "").slice(0, 10);

  let written = 0;
  const skipped = [];
  for (const cat of cats) {
    // slugs are pipeline-generated; refuse anything that could escape the
    // output dir rather than trying to sanitize it.
    if (!cat.slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(cat.slug)) {
      skipped.push(cat.slug || "(missing slug)");
      continue;
    }
    writeFileSync(join(dir, `${cat.slug}.html`), categoryHtml(cat, entries, categories, overrides));
    written++;
  }
  // events.json comes from a separate pipeline and may not exist yet; a thin
  // events page is worse than none, so it's only written when there's content
  let events = 0;
  if (eventsData && upcomingEvents(eventsData.events, today).length) {
    writeFileSync(join(outDir, "events.html"), eventsHtml(eventsData, today));
    events = upcomingEvents(eventsData.events, today).length;
  }
  writeFileSync(join(outDir, "sitemap.xml"), sitemapXml(categories, meta, eventsData, today));
  writeFileSync(join(outDir, "robots.txt"), robotsTxt());
  return { written, skipped, events };
}

// ---- CLI ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] || ROOT);
  const entries = JSON.parse(readFileSync(join(ROOT, "data", "entries.json"), "utf8"));
  const categories = JSON.parse(readFileSync(join(ROOT, "data", "categories.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(ROOT, "data", "meta.json"), "utf8"));
  let rawOverrides = null;
  try { rawOverrides = JSON.parse(readFileSync(join(ROOT, "data", "seo-overrides.json"), "utf8")); }
  catch { /* optional file */ }
  let eventsData = null;
  try { eventsData = JSON.parse(readFileSync(join(ROOT, "data", "events.json"), "utf8")); }
  catch { /* optional file — second pipeline, may not have landed */ }
  const { written, skipped, events } = buildSeo(entries, categories, meta, outDir, rawOverrides, eventsData);
  console.log(`seo surface: wrote ${written} category pages + ` +
    (events ? `events.html (${events} events) + ` : "") +
    `sitemap.xml + robots.txt to ${outDir}`);
  if (skipped.length) console.warn(`skipped ${skipped.length} categories with unusable slugs: ${skipped.join(", ")}`);
}
