// scripts/build-seo.mjs — indexable category pages + sitemap.xml + robots.txt.
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIN_ENTRIES, buildSeo, categoryHtml, robotsTxt, sitemapXml,
} from "../scripts/build-seo.mjs";
import { CATEGORIES, ENTRIES, META } from "./harness.js";

let dir;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = null; });

function build(entries = ENTRIES, categories = CATEGORIES, meta = META) {
  dir = mkdtempSync(join(tmpdir(), "seo-"));
  const res = buildSeo(entries, categories, meta, dir);
  return { ...res, read: (f) => readFileSync(join(dir, f), "utf8") };
}

const plumbing = CATEGORIES.find((c) => c.slug === "plumbing");

describe("buildSeo", () => {
  it(`writes pages only for categories with >= ${MIN_ENTRIES} entries`, () => {
    build();
    // plumbing + tutoring qualify; electrician (2) and roofing (0) are thin
    expect(readdirSync(join(dir, "c")).sort()).toEqual(["plumbing.html", "tutoring.html"]);
    expect(existsSync(join(dir, "sitemap.xml"))).toBe(true);
    expect(existsSync(join(dir, "robots.txt"))).toBe(true);
  });

  it("refuses category slugs that could escape the output dir", () => {
    const { written, skipped } = build(ENTRIES, CATEGORIES.concat([
      { slug: "../evil", name: "Evil", entry_count: 9 },
    ]));
    expect(skipped).toEqual(["../evil"]);
    expect(written).toBe(2);
  });
});

describe("categoryHtml", () => {
  it("is an indexable page: self-canonical, no noindex, local-intent title", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES);
    expect(html).not.toContain("noindex");
    expect(html).toContain('<link rel="canonical" href="https://losaltos.space/c/plumbing.html" />');
    expect(html).toContain("<title>2 Neighbor-Recommended Plumbing Providers in Los Altos, CA · Los Altos List</title>");
    expect(html).toContain("<h1>Plumbing in Los Altos, recommended by neighbors</h1>");
  });

  it("renders providers sorted by mentions with quotes, contacts, and SPA deep links", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES);
    // bay-plumbers (3 mentions) before ace-pipes (1)
    expect(html.indexOf("Bay Plumbers")).toBeLessThan(html.indexOf("Ace Pipes"));
    expect(html).toContain("★ 3 neighbor mentions");
    expect(html).toContain("“Fast and fair.”");
    expect(html).toContain('href="tel:4087132939"');
    expect(html).toContain('href="/#c=plumbing&amp;e=bay-plumbers&amp;via=cat"');
  });

  it("emits ItemList + BreadcrumbList JSON-LD that parses", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES);
    const m = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const [itemList, breadcrumb] = JSON.parse(m[1]);
    expect(itemList["@type"]).toBe("ItemList");
    expect(itemList.numberOfItems).toBe(2);
    expect(itemList.itemListElement[0].item.name).toBe("Bay Plumbers");
    expect(itemList.itemListElement[0].item.telephone).toBe("(408) 713-2939");
    expect(breadcrumb["@type"]).toBe("BreadcrumbList");
  });

  it("cross-links other category pages but not itself", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES);
    expect(html).toContain('<a href="/c/tutoring.html">Tutoring</a>');
    expect(html).not.toContain('<a href="/c/plumbing.html">');
    // thin categories don't get linked (no dead links)
    expect(html).not.toContain("/c/electrician.html");
  });

  it("HTML-escapes quotes and names", () => {
    const html = categoryHtml(
      CATEGORIES.find((c) => c.slug === "tutoring"), ENTRIES, CATEGORIES);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("sitemapXml / robotsTxt", () => {
  it("lists home + qualifying category pages with lastmod dates", () => {
    const xml = sitemapXml(CATEGORIES, META);
    expect(xml).toContain("<loc>https://losaltos.space/</loc>");
    expect(xml).toContain("<loc>https://losaltos.space/c/plumbing.html</loc>");
    expect(xml).toContain("<lastmod>2026-07-13</lastmod>"); // plumbing last_activity
    expect(xml).not.toContain("electrician");
    expect(xml).toContain("<lastmod>2026-07-14</lastmod>"); // home ← META.generated_at
  });

  it("robots.txt allows all and points at the sitemap", () => {
    const txt = robotsTxt();
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://losaltos.space/sitemap.xml");
  });
});
