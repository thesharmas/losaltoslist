// PostHog share analytics: card_shared outcomes, card_link_opened attribution,
// and secondary-category tag clicks. The harness injects a posthog stub that
// records capture() calls.
import { afterEach, describe, expect, it } from "vitest";
import { boot, closeAll } from "./harness.js";

afterEach(closeAll);

function events(calls, name) {
  return calls.filter((c) => c.name === name);
}

describe("card_shared", () => {
  it("copy path fires card_shared with method=copy after the copy succeeds", async () => {
    const calls = [];
    const { $ } = await boot({ posthog: calls, clipboard: [] });
    $('.card[data-id="bay-plumbers"] .share-btn').click();
    await Promise.resolve(); // let copyText resolve
    const shared = events(calls, "card_shared");
    expect(shared).toHaveLength(1);
    expect(shared[0].props).toMatchObject({
      entry_id: "bay-plumbers",
      business: "Bay Plumbers",
      method: "copy",
    });
  });

  it("native path fires method=native only when the share completes", async () => {
    const calls = [];
    const { $, window } = await boot({ posthog: calls });
    window.navigator.share = () => Promise.resolve(); // user completed the sheet
    $('.card[data-id="ace-pipes"] .share-btn').click();
    await Promise.resolve();
    const shared = events(calls, "card_shared");
    expect(shared).toHaveLength(1);
    expect(shared[0].props).toMatchObject({ entry_id: "ace-pipes", method: "native" });
  });

  it("does not fire when the user dismisses the native share sheet", async () => {
    const calls = [];
    const { $, window } = await boot({ posthog: calls });
    window.navigator.share = () => Promise.reject(new Error("AbortError"));
    $('.card[data-id="ace-pipes"] .share-btn').click();
    await Promise.resolve();
    await Promise.resolve(); // let the rejection settle
    expect(events(calls, "card_shared")).toHaveLength(0);
  });
});

describe("card_link_opened attribution", () => {
  it("via=share (stub redirect) is attributed to a shared link", async () => {
    const calls = [];
    await boot({ posthog: calls, hash: "#c=plumbing&e=bay-plumbers&via=share" });
    const opened = events(calls, "card_link_opened");
    expect(opened).toHaveLength(1);
    expect(opened[0].props).toEqual({ entry_id: "bay-plumbers", via: "share" });
  });

  it("plain deep links count as direct", async () => {
    const calls = [];
    await boot({ posthog: calls, hash: "#e=bay-plumbers" });
    expect(events(calls, "card_link_opened")[0].props).toEqual({
      entry_id: "bay-plumbers",
      via: "direct",
    });
  });

  it("via never leaks back into the hash on the next interaction", async () => {
    const { window, $$ } = await boot({ hash: "#c=plumbing&e=bay-plumbers&via=share" });
    const tutoring = $$("#chips .chip").find((c) => c.dataset.slug === "tutoring");
    tutoring.click();
    expect(window.location.hash).toContain("c=tutoring");
    expect(window.location.hash).not.toContain("via=");
    expect(window.location.hash).not.toContain("e=");
  });
});

describe("cat_tag_clicked", () => {
  const ENTRIES = [
    {
      id: "miguel",
      category: "landscaper",
      categories: ["landscaper", "contractor"],
      name: "Miguel",
      contact: { phones: [], emails: [], websites: [] },
      mentions: [{ quote: "Yard + wall.", by: "Neha", date: "2026-07-14", msg_id: "m1", type: "review" }],
      first_seen: "2026-07-14", last_seen: "2026-07-14", mention_count: 1,
    },
  ];
  const CATEGORIES = [
    { slug: "landscaper", name: "Landscaper", emoji: "🌿", entry_count: 1, query_count: 0, last_activity: "2026-07-14" },
    { slug: "contractor", name: "Contractor", emoji: "🏗️", entry_count: 1, query_count: 0, last_activity: "2026-07-14" },
  ];

  it("fires with the business and both categories when a +tag is clicked", async () => {
    const calls = [];
    const { $ } = await boot({ posthog: calls, entries: ENTRIES, categories: CATEGORIES });
    $('.card[data-id="miguel"] .cat-tag').click();
    const tagged = events(calls, "cat_tag_clicked");
    expect(tagged).toHaveLength(1);
    expect(tagged[0].props).toMatchObject({
      to_category: "Contractor",
      business: "Miguel",
      from_category: "Landscaper",
    });
    // the tag click still counts as a category_filter change too
    expect(events(calls, "category_filter")).toHaveLength(1);
  });
});
