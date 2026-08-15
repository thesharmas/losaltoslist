// Pure-ish helpers (fmtDate, hostname, displayName, catMeta/titleCase) are
// trapped in the page's IIFE, so we observe them through their rendered output.
import { afterEach, describe, expect, test } from "vitest";
import { boot, closeAll } from "./harness.js";

afterEach(closeAll);

// Find a rendered card by its <h3> text.
function cardByTitle($$, title) {
  return $$(".card:not(.skeleton)").find((c) => c.querySelector("h3")?.textContent === title);
}

describe("fmtDate", () => {
  test("formats an ISO date as 'Mon D, YYYY' in the attribution line", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "Bay Plumbers");
    // First mention date is 2026-07-11.
    expect(card.querySelector(".attribution").textContent).toContain("Jul 11, 2026");
  });

  test("stamp shows the meta generated_at date, not the raw timestamp", async () => {
    const { document } = await boot();
    const stamp = document.getElementById("stamp").textContent;
    expect(stamp).toContain("Jul 14, 2026");
    expect(stamp).not.toContain("T04:05");
  });
});

describe("hostname (via unnamed website entries)", () => {
  test("strips protocol, www, and path down to the bare host", async () => {
    const { $$ } = await boot();
    // Unnamed tutoring entry with website https://www.mathwhiz.com/algebra.
    const card = cardByTitle($$, "mathwhiz.com");
    expect(card).toBeTruthy();
    // The website pill also shows the hostname as its display text.
    expect(card.querySelector(".contact-main span").textContent).toBe("mathwhiz.com");
  });
});

describe("displayName fallbacks", () => {
  test("named entry shows its name with no unnamed styling", async () => {
    const { $$ } = await boot();
    const h3 = cardByTitle($$, "Bay Plumbers").querySelector("h3");
    expect(h3.classList.contains("h3-unnamed")).toBe(false);
  });

  test("unnamed entry with a website falls back to the hostname (unnamed styling)", async () => {
    const { $$ } = await boot();
    const h3 = cardByTitle($$, "mathwhiz.com").querySelector("h3");
    expect(h3.classList.contains("h3-unnamed")).toBe(true);
  });

  test("unnamed entry with no website falls back to 'A recommended <category>'", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "A recommended electrician");
    expect(card).toBeTruthy();
    expect(card.querySelector("h3").classList.contains("h3-unnamed")).toBe(true);
  });
});

describe("catMeta / titleCase", () => {
  test("uses the category name and emoji from categories.json", async () => {
    const { $$ } = await boot();
    const eyebrow = cardByTitle($$, "Bay Plumbers").querySelector(".card-eyebrow");
    expect(eyebrow.textContent).toContain("Plumbing");
    expect(eyebrow.querySelector(".emoji").textContent).toBe("🔧");
  });

  test("title-cases and uses a bullet when the category is absent from categories.json", async () => {
    const { $$ } = await boot({
      categories: [], // nothing matches -> catMeta falls back to titleCase + "•"
      entries: [{
        id: "x", category: "solar panel install", name: "Sunny Co",
        contact: { phones: [], emails: [], websites: [] },
        mentions: [{ quote: "ok", by: "A", date: "2026-07-01", msg_id: "z", type: "review" }],
        first_seen: "2026-07-01", last_seen: "2026-07-01", mention_count: 1,
      }],
    });
    const eyebrow = cardByTitle($$, "Sunny Co").querySelector(".card-eyebrow");
    expect(eyebrow.textContent).toContain("Solar Panel Install");
    expect(eyebrow.querySelector(".emoji").textContent).toBe("•");
  });
});
