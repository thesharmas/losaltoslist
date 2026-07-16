// Typo-tolerant search: when a query gets zero exact (substring) hits, the
// page retries with per-word bounded edit-distance matching against entry
// names + category names. The fixture queries here are real zero-result
// searches captured by PostHog before this feature existed.
import { afterEach, describe, expect, test } from "vitest";
import { boot, closeAll, delay } from "./harness.js";

afterEach(closeAll);

const titles = ($$) => $$(".card:not(.skeleton) h3").map((h) => h.textContent);

// Fire the debounced search input and wait past the 140ms debounce.
async function search(ctx, value) {
  ctx.$("#search").value = value;
  ctx.$("#search").dispatchEvent(new ctx.window.Event("input"));
  await delay(200);
}

// Dataset mirroring the real-world categories the failed queries were after.
const CATEGORIES = [
  { slug: "landscaper", name: "Landscaper", emoji: "🌿", entry_count: 2 },
  { slug: "architect", name: "Architect", emoji: "📐", entry_count: 1 },
  { slug: "upholstery", name: "Upholstery", emoji: "🛋️", entry_count: 1 },
];

function mk(id, name, category, extra) {
  return Object.assign({
    id, category, name,
    contact: { phones: [], emails: [], websites: [] },
    mentions: [{ quote: "Recommended.", by: "Neighbor", date: "2026-07-10", msg_id: id + "-m", type: "review" }],
    first_seen: "2026-07-10", last_seen: "2026-07-10", mention_count: 1,
  }, extra || {});
}

const ENTRIES = [
  mk("gcsf", "GCSF Landscaping", "landscaper"),
  mk("jesus", "Jesus Landscape Services", "landscaper"),
  mk("studio-arc", "Studio Arc", "architect"),
  mk("foam", "Foam & Fabric", "upholstery"),
];

const DATA = { categories: CATEGORIES, entries: ENTRIES };

describe("typo-tolerant search (fuzzy fallback)", () => {
  test('"GLandscaper" (stray leading key) still finds the landscapers', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "GLandscaper");
    expect(titles(ctx.$$).sort()).toEqual(["GCSF Landscaping", "Jesus Landscape Services"]);
  });

  test('"Archihet" (garbled while typing "Architect") finds the architect', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "Archihet");
    expect(titles(ctx.$$)).toEqual(["Studio Arc"]);
  });

  test('"Iphol" (typo of "Uphol...") prefix-matches Upholstery', async () => {
    const ctx = await boot(DATA);
    await search(ctx, "Iphol");
    expect(titles(ctx.$$)).toEqual(["Foam & Fabric"]);
  });

  test("multi-word fuzzy queries need every token to match one entry", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "gcsf landscapre"); // second token typo'd
    expect(titles(ctx.$$)).toEqual(["GCSF Landscaping"]);
  });

  test("result count says 'closely matching' only for fuzzy results", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "Archihet");
    expect(ctx.$("#result-count").textContent).toContain("closely matching");

    await search(ctx, "landscap"); // exact substring hit
    expect(ctx.$("#result-count").textContent).not.toContain("closely");
    expect(ctx.$("#result-count").textContent).toContain("matching");
  });

  test("fuzzy respects the active category filter", async () => {
    const ctx = await boot(DATA);
    const chip = ctx.$$("#chips .chip").find((c) => c.dataset.slug === "architect");
    chip.click();
    await search(ctx, "GLandscaper"); // landscapers exist, but not in this category
    expect(ctx.$(".notice")).toBeTruthy(); // empty state, no cross-category leak
  });
});

describe("fuzzy guardrails (no false rescues)", () => {
  test("short tokens (<4 chars) never fuzzy-match", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "xrc"); // 1 edit from "arc", but budget for len 3 is 0
    expect(ctx.$(".notice")).toBeTruthy();
  });

  test("garbage stays a zero-result search", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "zzzznomatch");
    expect(ctx.$(".notice")).toBeTruthy();
  });

  test("mention quotes are exact-only (no fuzzy noise from free text)", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "Recomendedd"); // typo of quote text "Recommended."
    expect(ctx.$(".notice")).toBeTruthy();
  });

  test("exact matches never go through the fuzzy path", async () => {
    const ctx = await boot(DATA);
    await search(ctx, "landsca");
    expect(titles(ctx.$$).sort()).toEqual(["GCSF Landscaping", "Jesus Landscape Services"]);
    expect(ctx.$("#result-count").textContent).not.toContain("closely");
  });
});

describe("fuzzy analytics", () => {
  test("search event carries fuzzy:true when the fallback rescued the query", async () => {
    const calls = [];
    const ctx = await boot(Object.assign({ posthog: calls }, DATA));
    await search(ctx, "Archihet");
    await delay(1200); // trackSearch fires 1100ms after the typing pause
    const ev = calls.filter((c) => c.name === "search");
    expect(ev.length).toBe(1);
    expect(ev[0].props).toMatchObject({ query: "Archihet", results_count: 1, fuzzy: true });
    expect(calls.filter((c) => c.name === "search_no_results").length).toBe(0);
  });

  test("exact search reports fuzzy:false; dead query still fires search_no_results", async () => {
    const calls = [];
    const ctx = await boot(Object.assign({ posthog: calls }, DATA));
    await search(ctx, "landscap");
    await delay(1200);
    let ev = calls.filter((c) => c.name === "search");
    expect(ev[0].props).toMatchObject({ query: "landscap", results_count: 2, fuzzy: false });

    await search(ctx, "zzzznomatch");
    await delay(1200);
    ev = calls.filter((c) => c.name === "search_no_results");
    expect(ev.length).toBe(1);
    expect(ev[0].props).toMatchObject({ query: "zzzznomatch" });
  });
});
