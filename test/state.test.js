// URL-hash state (readHash/writeHash) and category chip building.
import { afterEach, describe, expect, test } from "vitest";
import { boot, closeAll, delay } from "./harness.js";

afterEach(closeAll);

const titles = ($$) => $$(".card:not(.skeleton) h3").map((h) => h.textContent);

describe("reading state from the URL on load", () => {
  test("applies category + query + sort from the initial hash", async () => {
    const ctx = await boot({ hash: "#c=plumbing&q=ace&sort=az" });
    expect(ctx.$("#search").value).toBe("ace");
    expect(ctx.$("#sort").value).toBe("az");
    expect(titles(ctx.$$)).toEqual(["Ace Pipes"]);
    const chip = ctx.$$("#chips .chip").find((c) => c.dataset.slug === "plumbing");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  test("ignores an unknown category slug", async () => {
    const ctx = await boot({ hash: "#c=teleportation" });
    expect(ctx.$$(".card:not(.skeleton)").length).toBe(5); // no filter applied
  });

  test("falls back to 'loved' for an invalid sort value", async () => {
    const ctx = await boot({ hash: "#sort=bogus" });
    expect(ctx.$("#sort").value).toBe("loved");
  });
});

describe("writing state to the URL", () => {
  test("selecting a category writes #c=<slug>", async () => {
    const ctx = await boot();
    ctx.$$("#chips .chip").find((c) => c.dataset.slug === "tutoring").click();
    expect(ctx.window.location.hash).toBe("#c=tutoring");
  });

  test("the default 'loved' sort is omitted from the hash", async () => {
    const ctx = await boot();
    ctx.$("#sort").value = "recent";
    ctx.$("#sort").dispatchEvent(new ctx.window.Event("change"));
    expect(ctx.window.location.hash).toBe("#sort=recent");

    ctx.$("#sort").value = "loved";
    ctx.$("#sort").dispatchEvent(new ctx.window.Event("change"));
    expect(ctx.window.location.hash).toBe(""); // cleared, not "#sort=loved"
  });

  test("query is written url-encoded", async () => {
    const ctx = await boot();
    ctx.$("#search").value = "bay area";
    ctx.$("#search").dispatchEvent(new ctx.window.Event("input"));
    await delay(200);
    expect(ctx.window.location.hash).toContain("q=bay+area");
  });
});

describe("hashchange (back/forward, pasted links)", () => {
  test("navigating the hash re-applies the state", async () => {
    const ctx = await boot();
    ctx.window.location.hash = "#c=electrician";
    ctx.window.dispatchEvent(new ctx.window.Event("hashchange"));
    await delay(20);
    // Electrician category holds only the unnamed 'mystery-sparky'.
    expect(titles(ctx.$$)).toEqual(["A recommended electrician"]);
  });
});

describe("category chips", () => {
  test("renders an 'All' chip plus one chip per non-empty category", async () => {
    const ctx = await boot();
    const chips = ctx.$$("#chips .chip");
    const labels = chips.map((c) => c.dataset.slug);
    expect(labels[0]).toBe(""); // the "All" chip has an empty slug
    // roofing has entry_count 0 and must be excluded.
    expect(labels).not.toContain("roofing");
    expect(labels).toEqual(expect.arrayContaining(["plumbing", "tutoring", "electrician"]));
  });

  test("chips are ordered by entry_count desc", async () => {
    const ctx = await boot();
    const withSlug = ctx.$$("#chips .chip").map((c) => c.dataset.slug).filter(Boolean);
    expect(withSlug).toEqual(["plumbing", "tutoring", "electrician"]); // 3, 3, 2 (name tiebreak)
  });

  test("overflow categories (>9) collapse into the 'More categories' select", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      slug: "cat" + i, name: "Cat " + String.fromCharCode(65 + i), emoji: "🔧",
      entry_count: 12 - i,
    }));
    const ctx = await boot({
      categories: many,
      entries: [{
        id: "e", category: "Cat A", name: "Solo",
        contact: { phones: [], emails: [], websites: [] },
        mentions: [{ quote: "q", by: "n", date: "2026-07-01", msg_id: "m", type: "review" }],
        first_seen: "2026-07-01", last_seen: "2026-07-01", mention_count: 1,
      }],
    });
    // 1 "All" + 9 top chips.
    expect(ctx.$$("#chips .chip").length).toBe(10);
    const sel = ctx.$("#chips select.cat-all");
    expect(sel).toBeTruthy();
    // Remaining 3 categories plus the default "More categories…" option.
    expect(sel.querySelectorAll("option").length).toBe(4);
  });

  test("choosing from the 'More categories' select activates that category", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      slug: "cat" + i, name: "Cat " + String.fromCharCode(65 + i), emoji: "🔧",
      entry_count: 12 - i,
    }));
    const ctx = await boot({ categories: many, entries: [] });
    const sel = ctx.$("#chips select.cat-all");
    sel.value = "cat11"; // an overflow category
    sel.dispatchEvent(new ctx.window.Event("change"));
    expect(ctx.window.location.hash).toBe("#c=cat11");
    expect(sel.selectedIndex).toBe(0); // resets back to the placeholder
  });
});
