// scripts/build-seo.mjs — indexable category pages + sitemap.xml + robots.txt.
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIN_ENTRIES, buildSeo, categoryHtml, eventsHtml, loadOverrides, robotsTxt,
  sitemapXml, trackAttrs, upcomingEvents,
} from "../scripts/build-seo.mjs";
import { CATEGORIES, ENTRIES, EVENTS, META } from "./harness.js";

let dir;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = null; });

function build(entries = ENTRIES, categories = CATEGORIES, meta = META, events, today) {
  dir = mkdtempSync(join(tmpdir(), "seo-"));
  const res = buildSeo(entries, categories, meta, dir, null, events, today);
  return { ...res, read: (f) => readFileSync(join(dir, f), "utf8") };
}

const TODAY = "2026-07-14"; // EVENTS fixture: 07-16, 07-18–19, 08-22

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
    expect(html).toMatch(/<a href="\/c\/tutoring\.html"[^>]*>Tutoring<\/a>/);
    expect(html).not.toContain('href="/c/plumbing.html"');
    // thin categories don't get linked (no dead links)
    expect(html).not.toContain("/c/electrician.html");
  });

  it("HTML-escapes quotes and names", () => {
    const html = categoryHtml(
      CATEGORIES.find((c) => c.slug === "tutoring"), ENTRIES, CATEGORIES);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps a provider name from breaking out of the JSON-LD block", () => {
    const cat = { slug: "plumbing", name: "Plumbing", entry_count: 3 };
    const evil = 'Ace </script><img src=x onerror=alert(1)>';
    const entry = (name) => [{
      id: "evil", category: "plumbing", name,
      contact: { phones: [], emails: [], websites: [] }, mentions: [], mention_count: 1,
    }];
    const html = categoryHtml(cat, entry(evil), CATEGORIES);
    const benign = categoryHtml(cat, entry("Ace"), CATEGORIES);
    // the hostile name must not add a single tag over the benign render
    expect((html.match(/<script/g) || []).length)
      .toBe((benign.match(/<script/g) || []).length);
    const block = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)<\/script>/)[1];
    expect(block).not.toContain("<");
  });
});

describe("category page analytics", () => {
  it("carries PostHog and tags every way off the page", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES);
    expect(html).toContain("posthog.init('phc_");
    expect(html).toContain("surface: 'category_page'");
    // into the app: the directory link and each provider deep link
    expect(html).toContain('data-track="seo_handoff" data-target="directory"');
    expect(html).toContain('data-track="seo_handoff" data-target="provider" data-entry-id="bay-plumbers"');
    // sideways to a sibling category, and out to GitHub
    expect(html).toContain('data-track="seo_internal_link" data-from-category="plumbing" data-to-category="tutoring"');
    expect(html).toContain('data-track="seo_outbound" data-target="github"');
  });

  it("tracks a phone click without putting the number in the props", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES);
    const tag = html.match(/<a href="tel:4087132939"[^>]*>/)[0];
    expect(tag).toContain('data-track="contact_clicked"');
    expect(tag).toContain('data-method="phone"');
    expect(tag).toContain('data-business="Bay Plumbers"');
    // index.html deliberately keeps phone/email values out of analytics; any
    // data-* attribute here would be sent, so the number must not appear
    expect(tag).not.toContain("4087132939\" data-url");
    expect(tag).not.toMatch(/data-(url|phone|value)=/);
  });

  it("sends the url for a website click, matching the app's contact_clicked", () => {
    const html = categoryHtml(
      CATEGORIES.find((c) => c.slug === "tutoring"), ENTRIES, CATEGORIES);
    const tag = html.match(/<a href="https:\/\/www\.mathwhiz\.com\/algebra"[^>]*>/)[0];
    expect(tag).toContain('data-method="website"');
    expect(tag).toContain('data-url="https://www.mathwhiz.com/algebra"');
  });

  it("escapes hostile values inside the tracking attributes", () => {
    // a name that would break out of the attribute if it were interpolated raw
    const html = categoryHtml(plumbing, [{
      id: "quoty", category: "plumbing", name: 'Ace" onmouseover="alert(1)',
      contact: { phones: ["(408) 555-0000"], emails: [], websites: [] },
      mentions: [], mention_count: 1,
    }], CATEGORIES);
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain('data-business="Ace&quot; onmouseover=&quot;alert(1)"');
  });
});

describe("trackAttrs", () => {
  it("dashes underscored keys so they round-trip to snake_case props", () => {
    expect(trackAttrs("x", { entry_id: "a-b", to_category: "c" }))
      .toBe(' data-track="x" data-entry-id="a-b" data-to-category="c"');
  });

  it("drops empty values rather than emitting blank props", () => {
    expect(trackAttrs("x", { a: null, b: undefined, c: "", d: "keep" }))
      .toBe(' data-track="x" data-d="keep"');
  });
});

describe("seo overrides", () => {
  it("applies title/description overrides for a slug", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES, loadOverrides({
      plumbing: { title: "Trusted Plumbers in Los Altos, CA (Neighbor Picks)",
                  description: "Hand-picked plumbers Los Altos neighbors actually use." },
    }));
    expect(html).toContain("<title>Trusted Plumbers in Los Altos, CA (Neighbor Picks) · Los Altos List</title>");
    expect(html).toContain('name="description" content="Hand-picked plumbers Los Altos neighbors actually use."');
    // untouched pieces keep their defaults
    expect(html).toContain("<h1>Plumbing in Los Altos, recommended by neighbors</h1>");
  });

  it("ignores _keys, non-objects, and empty strings; falls back to defaults", () => {
    expect(loadOverrides({ _about: "x", plumbing: "nope", tutoring: { title: "  " } })).toEqual({});
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES, loadOverrides(null));
    expect(html).toContain("<title>2 Neighbor-Recommended Plumbing Providers in Los Altos, CA · Los Altos List</title>");
  });

  it("HTML-escapes override values", () => {
    const html = categoryHtml(plumbing, ENTRIES, CATEGORIES, loadOverrides({
      plumbing: { title: 'Plumbers <script>"x"</script>' },
    }));
    expect(html).not.toContain("<script>\"x\"");
    expect(html).toContain("Plumbers &lt;script&gt;");
  });
});

describe("upcomingEvents", () => {
  it("drops events that already ended and keeps one running today", () => {
    const list = upcomingEvents(EVENTS.events, "2026-07-19");
    // the 07-16 event is over; the 07-18–19 one still runs through today
    expect(list.map((e) => e.id)).toEqual(["evt_xss", "evt_multiday"]);
  });

  it("leads with local events, then falls back to date order", () => {
    const list = upcomingEvents(EVENTS.events, TODAY);
    // community, then local, then regional — despite regional starting sooner
    expect(list.map((e) => e.kind)).toEqual(["community", "local", "regional"]);
  });

  it("tolerates a missing or malformed events array", () => {
    expect(upcomingEvents(undefined, TODAY)).toEqual([]);
    expect(upcomingEvents("nope", TODAY)).toEqual([]);
  });
});

describe("eventsHtml", () => {
  it("is an indexable page with a local-intent title and canonical", () => {
    const html = eventsHtml(EVENTS, TODAY);
    expect(html).not.toContain("noindex");
    expect(html).toContain('<link rel="canonical" href="https://losaltos.space/events.html" />');
    expect(html).toContain("Things to Do Around Los Altos — 3 Upcoming Community Events");
    expect(html).toContain("<h1>What's on around Los Altos</h1>");
    expect(html).toContain('href="/#view=events&amp;via=events"'); // into the SPA calendar
  });

  it("emits Event JSON-LD with dates, place and free-offer pricing", () => {
    const html = eventsHtml(EVENTS, TODAY);
    const m = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)<\/script>/);
    const ld = JSON.parse(m[1]);
    const dandiya = ld.find((n) => n.name === "DOLAH Dandiya Night");
    expect(dandiya["@type"]).toBe("Event");
    expect(dandiya.startDate).toBe("2026-07-16");
    expect(dandiya.location.address.addressLocality).toBe("Los Altos");
    expect(dandiya.isAccessibleForFree).toBe(true);
    expect(dandiya.offers.price).toBe("0");

    // a multi-day regional event keeps its real end date and real city
    const fest = ld.find((n) => n.name === "Festival of India");
    expect(fest.endDate).toBe("2026-07-19");
    expect(fest.location.address.addressLocality).toBe("Fremont");
    expect(fest.isAccessibleForFree).toBeUndefined();

    expect(ld.at(-1)["@type"]).toBe("BreadcrumbList");
  });

  it("escapes event titles and descriptions", () => {
    const html = eventsHtml(EVENTS, TODAY);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  // JSON.stringify does not escape "<", so a title holding "</script>" would
  // otherwise close the JSON-LD block and inject live markup into the page.
  it("never lets a title break out of the JSON-LD block", () => {
    const evil = {
      events: [{ id: "x", title: 'Fair </script><img src=x onerror=alert(1)>',
                 kind: "local", start_date: "2026-08-01", city: "Los Altos" }],
      promos: [],
    };
    const html = eventsHtml(evil, TODAY);
    const benign = eventsHtml({
      events: [{ ...evil.events[0], title: "Fair" }], promos: [],
    }, TODAY);
    // the hostile title must not add a single tag over the benign render
    expect((html.match(/<script/g) || []).length)
      .toBe((benign.match(/<script/g) || []).length);
    const block = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)<\/script>/)[1];
    expect(block).not.toContain("<");        // no raw "<" means no tag can form
    expect(JSON.parse(block)[0].name).toBe('Fair </script><img src=x onerror=alert(1)>');
  });

  it("carries PostHog and tags every hand-off back into the app", () => {
    const html = eventsHtml(EVENTS, TODAY);
    expect(html).toContain("posthog.init('phc_");
    expect(html).toContain("surface: 'events_page'");
    // the SPA link must carry via= or the landing looks like direct traffic
    expect(html).toContain('href="/#view=events&amp;via=events"');
    expect(html).toContain('data-track="seo_handoff"');
    expect(html).toContain('data-track="event_link_opened"');
    expect(html).toContain('data-event-id="evt_multiday"');
  });

  it("does not wire tracking onto an event with no outbound link", () => {
    const html = eventsHtml({ events: [EVENTS.events[0]], promos: [] }, TODAY);
    // evt_community has url: null — no link, so nothing to track
    expect(html).not.toContain('data-track="event_link_opened"');
  });

  it("lists promos without dressing them up as events", () => {
    const html = eventsHtml(EVENTS, TODAY);
    expect(html).toContain("Ghar Ka Swaad");
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">\n([\s\S]*?)<\/script>/)[1]);
    expect(ld.some((n) => n.name === "Ghar Ka Swaad")).toBe(false);
  });
});

describe("buildSeo with events", () => {
  it("writes events.html and lists it in the sitemap", () => {
    const { events, read } = build(ENTRIES, CATEGORIES, META, EVENTS, TODAY);
    expect(events).toBe(3);
    expect(read("events.html")).toContain("What's on around Los Altos");
    expect(read("sitemap.xml")).toContain("<loc>https://losaltos.space/events.html</loc>");
  });

  it("writes no events page when the file is absent", () => {
    build();
    expect(existsSync(join(dir, "events.html"))).toBe(false);
    expect(readFileSync(join(dir, "sitemap.xml"), "utf8")).not.toContain("events.html");
  });

  it("writes no events page when every event has already passed", () => {
    const { events } = build(ENTRIES, CATEGORIES, META, EVENTS, "2027-01-01");
    expect(events).toBe(0);
    expect(existsSync(join(dir, "events.html"))).toBe(false);
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
