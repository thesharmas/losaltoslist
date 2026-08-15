// Shareable cards: #e=<id> deep links + the per-card share button.
import { afterEach, describe, expect, it } from "vitest";
import { boot, closeAll } from "./harness.js";

afterEach(closeAll);

describe("deep link (#e=<id>)", () => {
  it("highlights the linked card and expands its extra mentions", async () => {
    const { $ } = await boot({ hash: "#e=bay-plumbers" });
    const card = $('.card[data-id="bay-plumbers"]');
    expect(card).toBeTruthy();
    expect(card.classList.contains("linked")).toBe(true);
    // the "+2 more notes" section auto-opens so the shared card shows everything
    expect(card.querySelector(".extra-wrap").hidden).toBe(false);
    expect(card.querySelector(".more-mentions").getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the category filter carried by the share link", async () => {
    const { $, $$ } = await boot({ hash: "#c=plumbing&e=ace-pipes" });
    expect($('.card[data-id="ace-pipes"]').classList.contains("linked")).toBe(true);
    // grid is filtered to plumbing (2 fixtures), not the full board
    expect($$(".card").length).toBe(2);
  });

  it("falls back to the entry's own category when filters would hide it", async () => {
    // link says category=tutoring but the entry is a plumber
    const { $, window } = await boot({ hash: "#c=tutoring&e=bay-plumbers" });
    const card = $('.card[data-id="bay-plumbers"]');
    expect(card).toBeTruthy();
    expect(card.classList.contains("linked")).toBe(true);
    // view swapped to the entry's real category
    const pressed = $('.chip[aria-pressed="true"]');
    expect(pressed.textContent).toContain("Plumbing");
    expect(window.document.querySelectorAll(".card").length).toBe(2);
  });

  it("ignores unknown entry ids without crashing", async () => {
    const { $$ } = await boot({ hash: "#e=not-a-real-entry" });
    expect($$(".card").length).toBeGreaterThan(0);
    expect($$(".card.linked").length).toBe(0);
  });

  it("drops e= from the hash when the user picks another category", async () => {
    const { $, window } = await boot({ hash: "#e=bay-plumbers" });
    const tutoring = [...window.document.querySelectorAll(".chip")]
      .find((c) => c.dataset.slug === "tutoring");
    tutoring.click();
    expect(window.location.hash).toContain("c=tutoring");
    expect(window.location.hash).not.toContain("e=");
    expect($(".card.linked")).toBeNull();
  });
});

describe("share button", () => {
  it("renders on every card with an id", async () => {
    const { $$ } = await boot();
    const cards = $$(".card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.querySelector(".share-btn")).toBeTruthy();
  });

  it("copies the entry's stub URL (rich-preview link) to the clipboard", async () => {
    const calls = [];
    const { $ } = await boot({ clipboard: calls });
    const btn = $('.card[data-id="bay-plumbers"] .share-btn');
    btn.click();
    await Promise.resolve(); // let copyText resolve
    expect(calls).toEqual(["https://losaltos.space/e/bay-plumbers.html"]);
    expect(btn.classList.contains("copied")).toBe(true);
  });

  it("prefers the native share sheet when navigator.share exists", async () => {
    const calls = [];
    const shared = [];
    const { $, window } = await boot({ clipboard: calls });
    window.navigator.share = (payload) => { shared.push(payload); return Promise.resolve(); };
    $('.card[data-id="ace-pipes"] .share-btn').click();
    expect(shared.length).toBe(1);
    expect(shared[0].url).toBe("https://losaltos.space/e/ace-pipes.html");
    expect(shared[0].title).toContain("Ace Pipes");
    expect(calls.length).toBe(0); // clipboard untouched
  });
});
