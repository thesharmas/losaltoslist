// Filtering + sorting (currentList) and the empty state, driven through the
// search box, category chips, and sort <select>.
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

describe("category filtering", () => {
  test("clicking a chip narrows to that category and toggles off on re-click", async () => {
    const ctx = await boot();
    const plumbing = ctx.$$("#chips .chip").find((c) => c.dataset.slug === "plumbing");

    plumbing.click();
    expect(titles(ctx.$$).sort()).toEqual(["Ace Pipes", "Bay Plumbers"]);
    expect(plumbing.getAttribute("aria-pressed")).toBe("true");

    plumbing.click(); // toggle back to All
    expect(ctx.$$(".card:not(.skeleton)").length).toBe(5);
    expect(plumbing.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("query filtering", () => {
  test("matches provider name (case-insensitive)", async () => {
    const ctx = await boot();
    await search(ctx, "bay");
    expect(titles(ctx.$$)).toEqual(["Bay Plumbers"]);
  });

  test("matches category text", async () => {
    const ctx = await boot();
    await search(ctx, "plumbing");
    expect(titles(ctx.$$).sort()).toEqual(["Ace Pipes", "Bay Plumbers"]);
  });

  test("matches quote text", async () => {
    const ctx = await boot();
    await search(ctx, "algebra");
    expect(titles(ctx.$$)).toEqual(["mathwhiz.com"]);
  });

  test("matches recommender first name", async () => {
    const ctx = await boot();
    await search(ctx, "priya"); // only appears as a mention 'by' on Bay Plumbers
    expect(titles(ctx.$$)).toEqual(["Bay Plumbers"]);
  });

  test("clear button empties the query and restores all cards", async () => {
    const ctx = await boot();
    await search(ctx, "bay");
    expect(ctx.$$(".card:not(.skeleton)").length).toBe(1);
    ctx.$("#search-clear").click();
    expect(ctx.$("#search").value).toBe("");
    expect(ctx.$$(".card:not(.skeleton)").length).toBe(5);
  });
});

describe("sorting", () => {
  const dataset = {
    categories: [{ slug: "plumbing", name: "Plumbing", emoji: "🔧", entry_count: 4 }],
    entries: [
      mk("Zed", 1, "2026-07-13"),
      mk("Ace", 5, "2026-06-01"),
      mk("Mid", 5, "2026-07-10"),
      mk(null, 2, "2026-07-12"), // unnamed
    ],
  };
  function mk(name, count, last) {
    return {
      id: (name || "unnamed") + "-" + count, category: "plumbing", name,
      contact: { phones: [], emails: [], websites: [] },
      mentions: [{ quote: "q", by: "n", date: last, msg_id: name + count, type: "review" }],
      first_seen: last, last_seen: last, mention_count: count,
    };
  }

  test("'loved' sorts by mention_count desc, tie-broken by last_seen desc", async () => {
    const ctx = await boot(dataset);
    ctx.$("#sort").value = "loved";
    ctx.$("#sort").dispatchEvent(new ctx.window.Event("change"));
    // count 5 both (Mid newer than Ace), then count 2 (unnamed), then count 1 (Zed).
    expect(titles(ctx.$$)).toEqual(["Mid", "Ace", "A recommended plumbing", "Zed"]);
  });

  test("'recent' sorts by last_seen desc", async () => {
    const ctx = await boot(dataset);
    ctx.$("#sort").value = "recent";
    ctx.$("#sort").dispatchEvent(new ctx.window.Event("change"));
    // 07-13 Zed, 07-12 unnamed, 07-10 Mid, 06-01 Ace.
    expect(titles(ctx.$$)).toEqual(["Zed", "A recommended plumbing", "Mid", "Ace"]);
  });

  test("'az' sorts named entries alphabetically; unnamed entries sink to the bottom", async () => {
    const ctx = await boot(dataset);
    ctx.$("#sort").value = "az";
    ctx.$("#sort").dispatchEvent(new ctx.window.Event("change"));
    expect(titles(ctx.$$)).toEqual(["Ace", "Mid", "Zed", "A recommended plumbing"]);
  });
});

describe("empty state", () => {
  test("no matches renders the notice, and reset restores the board", async () => {
    const ctx = await boot();
    await search(ctx, "zzzznomatch");
    expect(ctx.$(".notice")).toBeTruthy();
    expect(ctx.$(".notice h3").textContent).toContain("Nobody on the list");

    ctx.$("#reset").click();
    expect(ctx.$("#search").value).toBe("");
    expect(ctx.$$(".card:not(.skeleton)").length).toBe(5);
  });
});

describe("result count", () => {
  test("pluralizes and names the active category", async () => {
    const ctx = await boot();
    await search(ctx, "bay");
    expect(ctx.$("#result-count").textContent).toContain("1 name");

    ctx.$("#search-clear").click();
    expect(ctx.$("#result-count").textContent).toContain("5 names");
  });
});
