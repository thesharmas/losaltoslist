// Boots the real index.html inside jsdom with a stubbed fetch, so the tests
// exercise the shipped IIFE without extracting or modifying the source.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(resolve(here, "..", "index.html"), "utf8");

// Track every booted window so afterEach can tear them down (the page starts a
// 2600ms placeholder-rotation interval that would otherwise leak between tests).
const live = new Set();

export function closeAll() {
  for (const w of live) {
    try { w.close(); } catch { /* already closed */ }
  }
  live.clear();
}

// ---- default fixtures ---------------------------------------------------
// Categories: slugs must match slugify(entry.category) for catMeta() lookups.
// "roofing" has entry_count 0 to prove buildChips() drops empty categories.
export const CATEGORIES = [
  { slug: "plumbing", name: "Plumbing", emoji: "🔧", entry_count: 3, query_count: 9, last_activity: "2026-07-13" },
  { slug: "tutoring", name: "Tutoring", emoji: "📚", entry_count: 3, query_count: 12, last_activity: "2026-07-12" },
  { slug: "electrician", name: "Electrician", emoji: "⚡", entry_count: 2, query_count: 4, last_activity: "2026-07-10" },
  { slug: "roofing", name: "Roofing", emoji: "🏠", entry_count: 0, query_count: 2, last_activity: "2026-06-01" },
];

export const ENTRIES = [
  {
    id: "bay-plumbers",
    category: "plumbing",
    name: "Bay Plumbers",
    contact: { phones: ["(408) 713-2939"], emails: [], websites: [] },
    mentions: [
      { quote: "Fast and fair.", date: "2026-07-11", type: "review" },
      { quote: "Fixed our heater same day.", date: "2026-07-05", type: "review" },
      { quote: "Used them twice.", date: "2026-06-20", type: "contact" },
    ],
    first_seen: "2026-06-20", last_seen: "2026-07-11", mention_count: 3,
  },
  {
    id: "ace-pipes",
    category: "plumbing",
    name: "Ace Pipes",
    contact: { phones: [], emails: ["hello@acepipes.com"], websites: [] },
    mentions: [
      { quote: "Solid for small jobs.", date: "2026-07-01", type: "contact" },
    ],
    first_seen: "2026-07-01", last_seen: "2026-07-01", mention_count: 1,
  },
  {
    id: "mathwhiz",
    category: "tutoring",
    name: null, // unnamed -> displayName() falls back to the website hostname
    contact: { phones: [], emails: [], websites: ["https://www.mathwhiz.com/algebra"] },
    mentions: [
      { quote: "Great with algebra.", date: "2026-07-09", type: "review" },
    ],
    first_seen: "2026-07-09", last_seen: "2026-07-09", mention_count: 1,
  },
  {
    id: "mystery-sparky",
    category: "electrician",
    name: null, // unnamed, no contact, no mentions -> "Listed by the group." path
    contact: { phones: [], emails: [], websites: [] },
    mentions: [],
    first_seen: "2026-07-02", last_seen: "2026-07-02", mention_count: 0,
  },
  {
    id: "escape-co",
    category: "tutoring",
    name: 'Escape & Co <x> "test"', // exercises esc() on the title
    contact: { phones: [], emails: [], websites: [] },
    mentions: [
      { quote: 'Watch out: <script>alert(1)</script> & "quotes".', date: "2026-07-08", type: "review" },
    ],
    first_seen: "2026-07-08", last_seen: "2026-07-08", mention_count: 1,
  },
];

// events.json is an object, not an array like the others. Dates are relative
// to a frozen "today" the event tests set, so countdowns stay deterministic.
export const EVENTS = {
  meta: { generated_at: "2026-07-14T04:31:45Z", upcoming_count: 3, promo_count: 2, schema_version: 1 },
  events: [
    {
      id: "evt_community", title: "DOLAH Dandiya Night", kind: "community",
      start_date: "2026-07-16", end_date: null, time: "6:30 PM",
      venue: "Grant Park Community Center", city: "Los Altos", organizer: null,
      cost: "Free", url: null, recurrence: null,
      description: "A Dandiya night for Los Altos residents.",
      from_image: true,
    },
    {
      id: "evt_multiday", title: "Festival of India", kind: "regional",
      start_date: "2026-07-18", end_date: "2026-07-19", time: "10 AM to 6 PM",
      venue: "39439 Paseo Padre Pkwy", city: "Fremont", organizer: "FOG",
      cost: null, url: "https://fogsv.com/event/", recurrence: null,
      description: "The 34th Festival of India.",
      from_image: false,
    },
    {
      id: "evt_xss", title: 'Craft Fair <script>alert(1)</script>', kind: "local",
      start_date: "2026-08-22", end_date: null, time: null,
      venue: "Shoup Park", city: "Los Altos", organizer: "O'Neil & Co",
      cost: null, url: "javascript:alert(1)", recurrence: "every Sunday",
      description: 'Quotes "and" <b>tags</b>.',
      from_image: false,
    },
  ],
  promos: [
    {
      id: "prm_one", name: "Ghar Ka Swaad", what: "home-cooked meals",
      url: null, contact: "ranvinder910@gmail.com, +1 408-480-6164",
      description: "Home-cooked meals using desi ghee.",
      expires: "2026-10-06",
    },
    {
      id: "prm_two", name: "Backyard Nourish", what: "home garden consulting",
      url: "www.backyardnourish.com", contact: null,
      description: "Home garden consulting services.",
      expires: "2026-09-20",
    },
  ],
};

export const META = {
  group: "Los Altos neighbors",
  generated_at: "2026-07-14T04:05:42Z",
  last_message_ts: "2026-07-14T02:31:34Z",
  message_count: 2049,
  entry_count: 371,
  category_count: 166,
  schema_version: 1,
};

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

// Match a fetch URL to one of the three data files by filename suffix.
function pickFile(url, files) {
  if (url.endsWith("entries.json")) return files.entries;
  if (url.endsWith("categories.json")) return files.categories;
  if (url.endsWith("meta.json")) return files.meta;
  if (url.endsWith("synonyms.json")) return files.synonyms;
  if (url.endsWith("events.json")) return files.events;
  return undefined;
}

/**
 * Boot the page.
 * options:
 *   entries/categories/meta  - override fixtures (null => that file 404s)
 *   synonyms                 - synonyms.json payload (default: 404s, like prod without the file)
 *   events                   - events.json payload (default: 404s, like prod without the file)
 *   now                      - freeze Date for countdown assertions, e.g. "2026-07-14"
 *   hash                     - initial location hash, e.g. "#c=plumbing"
 *   fetchImpl                - fully custom fetch (for error-path tests)
 *   clipboard                - array to collect clipboard.writeText values
 *   posthog                  - array to collect {name, props} capture calls
 * Resolves once the grid has rendered (cards, notice, or error).
 */
export async function boot(options = {}) {
  const files = {
    entries: options.entries === undefined ? ENTRIES : options.entries,
    categories: options.categories === undefined ? CATEGORIES : options.categories,
    meta: options.meta === undefined ? META : options.meta,
    synonyms: options.synonyms === undefined ? null : options.synonyms,
    events: options.events === undefined ? null : options.events,
  };
  const clipboardCalls = options.clipboard || [];

  const fetchImpl = options.fetchImpl || function (url) {
    const data = pickFile(String(url), files);
    if (data == null) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error("404")) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(clone(data)) });
  };

  const dom = new JSDOM(HTML, {
    url: "https://example.test/" + (options.hash || ""),
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = fetchImpl;
      if (options.posthog) {
        // __SV: 1 makes the page's PostHog snippet treat this stub as the
        // already-initialised SDK, so capture() calls land here untouched.
        const captures = options.posthog;
        window.posthog = {
          __SV: 1,
          init() {}, register() {},
          capture: (name, props) => { captures.push({ name, props: props || {} }); },
        };
      }
      // Freeze "now" so "In 2 days" / "Tomorrow" countdowns are deterministic.
      // Only the zero-arg constructor is pinned; new Date(y, m, d) must still
      // work, since that is how the page parses event dates.
      if (options.now) {
        const Real = window.Date;
        const fixed = new Real(options.now + "T12:00:00").getTime();
        function FakeDate(...args) {
          return args.length ? new Real(...args) : new Real(fixed);
        }
        FakeDate.prototype = Real.prototype;
        FakeDate.now = () => fixed;
        FakeDate.parse = Real.parse;
        FakeDate.UTC = Real.UTC;
        window.Date = FakeDate;
      }
      // jsdom implements neither of these; the page calls both.
      window.Element.prototype.scrollIntoView = function () {};
      window.scrollTo = function () {};
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: { writeText: (t) => { clipboardCalls.push(t); return Promise.resolve(); } },
      });
    },
  });
  live.add(dom.window);

  await waitForRender(dom.window.document);
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    clipboardCalls,
    $: (sel) => dom.window.document.querySelector(sel),
    $$: (sel) => [...dom.window.document.querySelectorAll(sel)],
  };
}

// Poll until the grid shows real content (cards, empty-notice, or error-notice)
// rather than the six loading skeletons.
export async function waitForRender(document, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const grid = document.getElementById("grid");
    if (grid && grid.querySelector(".card:not(.skeleton), .notice")) return;
    await delay(10);
  }
  throw new Error("timed out waiting for the grid to render");
}

// Small real-time wait helper for debounce / async assertions.
export { delay };
