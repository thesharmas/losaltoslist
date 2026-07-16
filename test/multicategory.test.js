// Multi-category providers (schema v1.1): `categories` array, primary first.
// A landscaper who's also a contractor must show up under both chips, carry
// clickable secondary tags, and stay backward compatible with v1 entries
// that only have the single `category` string.
import { afterEach, describe, expect, it } from "vitest";
import { boot, closeAll } from "./harness.js";
import { stubHtml } from "../scripts/build-stubs.mjs";

afterEach(closeAll);

const CATEGORIES = [
  { slug: "landscaper", name: "Landscaper", emoji: "🌿", entry_count: 2, query_count: 3, last_activity: "2026-07-14" },
  { slug: "contractor", name: "Contractor", emoji: "🏗️", entry_count: 2, query_count: 5, last_activity: "2026-07-13" },
  { slug: "plumbing", name: "Plumbing", emoji: "🔧", entry_count: 1, query_count: 1, last_activity: "2026-07-10" },
];

const ENTRIES = [
  {
    id: "miguel",
    category: "landscaper",
    categories: ["landscaper", "contractor"],
    name: "Miguel",
    contact: { phones: ["(650) 555-0101"], emails: [], websites: [] },
    mentions: [
      { quote: "Redid our yard and the retaining wall.", by: "Neha", date: "2026-07-14", msg_id: "m1", type: "review" },
      { quote: "Great general contractor too.", by: "Raj", date: "2026-07-01", msg_id: "m2", type: "review" },
    ],
    first_seen: "2026-07-01", last_seen: "2026-07-14", mention_count: 2,
  },
  {
    id: "green-thumb",
    category: "landscaper", // v1 entry: no categories array
    name: "Green Thumb",
    contact: { phones: [], emails: [], websites: [] },
    mentions: [{ quote: "Weekly maintenance.", by: "Dana", date: "2026-07-08", msg_id: "m3", type: "contact" }],
    first_seen: "2026-07-08", last_seen: "2026-07-08", mention_count: 1,
  },
  {
    id: "build-right",
    category: "contractor",
    categories: ["contractor"],
    name: "Build Right",
    contact: { phones: [], emails: [], websites: [] },
    mentions: [{ quote: "Solid remodel.", by: "Sam", date: "2026-07-13", msg_id: "m4", type: "review" }],
    first_seen: "2026-07-13", last_seen: "2026-07-13", mention_count: 1,
  },
  {
    id: "pipe-pro",
    category: "plumbing",
    categories: ["plumbing"],
    name: "Pipe Pro",
    contact: { phones: [], emails: [], websites: [] },
    mentions: [{ quote: "Fixed the leak.", by: "Ana", date: "2026-07-10", msg_id: "m5", type: "review" }],
    first_seen: "2026-07-10", last_seen: "2026-07-10", mention_count: 1,
  },
];

const opts = { entries: ENTRIES, categories: CATEGORIES };

function chip(ctx, slug) {
  return ctx.$$("#chips .chip").find((c) => c.dataset.slug === slug);
}
function titles(ctx) {
  return ctx.$$(".card h3").map((h) => h.textContent);
}

describe("multi-category filtering", () => {
  it("shows a provider under every category it belongs to", async () => {
    const ctx = await boot(opts);
    chip(ctx, "landscaper").click();
    expect(titles(ctx)).toEqual(expect.arrayContaining(["Miguel", "Green Thumb"]));
    expect(titles(ctx)).toHaveLength(2);
    chip(ctx, "contractor").click();
    expect(titles(ctx)).toEqual(expect.arrayContaining(["Miguel", "Build Right"]));
    expect(titles(ctx)).toHaveLength(2);
  });

  it("still filters v1 single-category entries (backward compatible)", async () => {
    const ctx = await boot(opts);
    chip(ctx, "plumbing").click();
    expect(titles(ctx)).toEqual(["Pipe Pro"]);
  });

  it("search matches secondary categories too", async () => {
    const ctx = await boot(opts);
    ctx.$("#search").value = "contractor";
    ctx.$("#search").dispatchEvent(new ctx.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250)); // debounce
    expect(titles(ctx)).toEqual(expect.arrayContaining(["Miguel", "Build Right"]));
    expect(titles(ctx)).toHaveLength(2);
  });
});

describe("secondary category tags", () => {
  it("renders +tags for secondary categories only", async () => {
    const ctx = await boot(opts);
    const miguel = ctx.$('.card[data-id="miguel"]');
    const tags = [...miguel.querySelectorAll(".cat-tag")];
    expect(tags.map((t) => t.textContent)).toEqual(["+Contractor"]);
    // primary stays in the eyebrow
    expect(miguel.querySelector(".cat-primary").textContent).toBe("Landscaper");
    // single-category cards get no tags
    expect(ctx.$('.card[data-id="build-right"]').querySelectorAll(".cat-tag")).toHaveLength(0);
    expect(ctx.$('.card[data-id="green-thumb"]').querySelectorAll(".cat-tag")).toHaveLength(0);
  });

  it("clicking a tag switches to that category", async () => {
    const ctx = await boot(opts);
    ctx.$('.card[data-id="miguel"] .cat-tag').click();
    expect(chip(ctx, "contractor").getAttribute("aria-pressed")).toBe("true");
    expect(titles(ctx)).toEqual(expect.arrayContaining(["Miguel", "Build Right"]));
    expect(ctx.window.location.hash).toContain("c=contractor");
  });
});

describe("share stubs for multi-category entries", () => {
  it("mentions secondary categories in the description", () => {
    const html = stubHtml(ENTRIES[0], "Landscaper");
    expect(html).toContain("<title>Miguel — Landscaper · Los Altos List</title>");
    expect(html).toContain("Also listed under Contractor.");
    // redirect keeps the primary category
    expect(html).toContain('location.replace("/#c=landscaper&e=miguel");');
  });

  it("omits the 'also listed' note for single-category entries", () => {
    const html = stubHtml(ENTRIES[2], "Contractor");
    expect(html).not.toContain("Also listed under");
  });
});
