// Search synonyms (data/synonyms.json): category-level vocabulary so queries
// like "irrigation" find landscapers. The file is optional — without it,
// search behaves exactly as before. Synonyms also feed the fuzzy tier, so
// typos of synonyms get rescued too.
import { afterEach, describe, expect, test } from "vitest";
import { boot, closeAll, delay } from "./harness.js";

afterEach(closeAll);

const titles = ($$) => $$(".card:not(.skeleton) h3").map((h) => h.textContent);

async function search(ctx, value) {
  ctx.$("#search").value = value;
  ctx.$("#search").dispatchEvent(new ctx.window.Event("input"));
  await delay(200);
}

const CATEGORIES = [
  { slug: "landscaper", name: "Landscaper", emoji: "🌿", entry_count: 2 },
  { slug: "upholstery", name: "Upholstery", emoji: "🛋️", entry_count: 1 },
  { slug: "architect", name: "Architect", emoji: "📐", entry_count: 1 },
];

function mk(id, name, category) {
  return {
    id, category, name,
    contact: { phones: [], emails: [], websites: [] },
    mentions: [{ quote: "Recommended.", by: "Neighbor", date: "2026-07-10", msg_id: id + "-m", type: "review" }],
    first_seen: "2026-07-10", last_seen: "2026-07-10", mention_count: 1,
  };
}

const ENTRIES = [
  mk("gcsf", "GCSF Landscaping", "landscaper"),
  mk("jesus", "Jesus Landscape Services", "landscaper"),
  mk("foam", "Foam & Fabric", "upholstery"),
  mk("studio-arc", "Studio Arc", "architect"),
];

const SYNONYMS = {
  _about: "test fixture — underscore keys must be ignored",
  landscaper: ["irrigation", "sprinkler", "drip system"],
  upholstery: ["furniture", "sofa"],
  "no-such-category": ["orphaned"], // present but no entry uses this slug
};

const DATA = { categories: CATEGORIES, entries: ENTRIES, synonyms: SYNONYMS };

describe("synonym matching", () => {
  test('"Irrigation" finds the landscapers via the synonym map (exact tier)', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "Irrigation");
    expect(titles(ctx.$$).sort()).toEqual(["GCSF Landscaping", "Jesus Landscape Services"]);
    // exact tier, not a fuzzy rescue — label must not say "closely"
    expect(ctx.$("#result-count").textContent).not.toContain("closely");
  });

  test('partial typing "sprinkl" matches (substring of a synonym)', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "sprinkl");
    expect(titles(ctx.$$).sort()).toEqual(["GCSF Landscaping", "Jesus Landscape Services"]);
  });

  test('multi-word synonym phrases match ("drip")', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "drip");
    expect(titles(ctx.$$).length).toBe(2);
  });

  test('typo of a synonym ("irigation") gets rescued by the fuzzy tier', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "irigation");
    expect(titles(ctx.$$).sort()).toEqual(["GCSF Landscaping", "Jesus Landscape Services"]);
    expect(ctx.$("#result-count").textContent).toContain("closely matching");
  });

  test("synonyms don't leak across categories", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "sofa");
    expect(titles(ctx.$$)).toEqual(["Foam & Fabric"]); // upholstery only, no landscapers
  });

  test("synonyms respect the active category filter", async () => {
    const ctx = await boot(DATA);
    const chip = ctx.$$("#chips .chip").find((c) => c.dataset.slug === "architect");
    chip.click();
    await search(ctx, "irrigation");
    expect(ctx.$(".notice")).toBeTruthy(); // landscapers exist but not in this category
  });
});

describe("without synonyms.json (file 404s — prod before the file ships)", () => {
  test("page boots normally and synonym-only queries stay empty", async () => {
    const ctx = await boot({ categories: CATEGORIES, entries: ENTRIES }); // no synonyms
    expect(ctx.$$(".card:not(.skeleton)").length).toBe(4);
    await search(ctx, "irrigation");
    expect(ctx.$(".notice")).toBeTruthy();
  });
});

describe("synonym analytics", () => {
  test("search rescued only by synonyms reports synonyms:true", async () => {
    const calls = [];
    const ctx = await boot(Object.assign({ posthog: calls }, DATA));
    await search(ctx, "irrigation");
    await delay(1200);
    const ev = calls.filter((c) => c.name === "search");
    expect(ev.length).toBe(1);
    expect(ev[0].props).toMatchObject({ query: "irrigation", results_count: 2, fuzzy: false, synonyms: true });
  });

  test("search that would match anyway reports synonyms:false", async () => {
    const calls = [];
    const ctx = await boot(Object.assign({ posthog: calls }, DATA));
    await search(ctx, "landscap");
    await delay(1200);
    const ev = calls.filter((c) => c.name === "search");
    expect(ev[0].props).toMatchObject({ query: "landscap", results_count: 2, synonyms: false });
  });
});
