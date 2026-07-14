// Card rendering: recommendation badges, mention expansion, contact pills.
import { afterEach, describe, expect, test } from "vitest";
import { boot, closeAll } from "./harness.js";

afterEach(closeAll);

function cardByTitle($$, title) {
  return $$(".card:not(.skeleton)").find((c) => c.querySelector("h3")?.textContent === title);
}

describe("recommendation badge", () => {
  test("multi-mention entry is 'loved' and counts neighbors", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "Bay Plumbers");
    expect(card.classList.contains("loved")).toBe(true);
    expect(card.querySelector(".recs").textContent).toContain("★ 3 neighbors");
  });

  test("single-mention entry is not 'loved' and reads '1 mention'", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "Ace Pipes");
    expect(card.classList.contains("loved")).toBe(false);
    expect(card.querySelector(".recs").textContent).toContain("1 mention");
  });
});

describe("extra mentions toggle", () => {
  test("collapses N-1 extra mentions behind a pluralized button", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "Bay Plumbers"); // 3 mentions -> 2 extra
    const toggle = card.querySelector(".more-mentions");
    expect(toggle.textContent).toBe("+ 2 more notes");
    expect(card.querySelector(".extra-wrap").hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("click expands, updates aria + label, and click again collapses", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "Bay Plumbers");
    const toggle = card.querySelector(".more-mentions");
    const wrap = card.querySelector(".extra-wrap");

    toggle.click();
    expect(wrap.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Show less");

    toggle.click();
    expect(wrap.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("+ 2 more notes");
  });

  test("single 'more' note uses the singular label", async () => {
    const { $$ } = await boot({
      entries: [{
        id: "two", category: "plumbing", name: "Two Notes",
        contact: { phones: [], emails: [], websites: [] },
        mentions: [
          { quote: "one", by: "A", date: "2026-07-01", msg_id: "a", type: "review" },
          { quote: "two", by: "B", date: "2026-07-02", msg_id: "b", type: "review" },
        ],
        first_seen: "2026-07-01", last_seen: "2026-07-02", mention_count: 2,
      }],
    });
    expect(cardByTitle($$, "Two Notes").querySelector(".more-mentions").textContent).toBe("+ 1 more note");
  });

  test("no toggle when there is only one mention", async () => {
    const { $$ } = await boot();
    expect(cardByTitle($$, "Ace Pipes").querySelector(".more-mentions")).toBeNull();
  });
});

describe("contact links", () => {
  test("phone renders a tel: link with formatting stripped from the href", async () => {
    const { $$ } = await boot();
    const link = cardByTitle($$, "Bay Plumbers").querySelector('.contact-main[href^="tel:"]');
    expect(link.getAttribute("href")).toBe("tel:4087132939");
    expect(link.querySelector("span").textContent).toBe("(408) 713-2939");
  });

  test("email renders a mailto: link", async () => {
    const { $$ } = await boot();
    const link = cardByTitle($$, "Ace Pipes").querySelector('.contact-main[href^="mailto:"]');
    expect(link.getAttribute("href")).toBe("mailto:hello@acepipes.com");
  });

  test("website opens in a new tab with rel=noopener", async () => {
    const { $$ } = await boot();
    const link = cardByTitle($$, "mathwhiz.com").querySelector('.contact-main[target="_blank"]');
    expect(link.getAttribute("rel")).toBe("noopener");
    expect(link.getAttribute("href")).toBe("https://www.mathwhiz.com/algebra");
  });

  test("no contact info shows the 'ask in the group' note", async () => {
    const { $$ } = await boot();
    // The unnamed electrician has empty contact and no mentions.
    const card = cardByTitle($$, "A recommended electrician");
    expect(card.querySelector(".card-foot .no-contact").textContent).toContain("No contact shared");
  });

  test("entry with zero mentions shows 'Listed by the group.'", async () => {
    const { $$ } = await boot();
    const card = cardByTitle($$, "A recommended electrician");
    expect(card.textContent).toContain("Listed by the group.");
  });
});

describe("copy-to-clipboard", () => {
  test("clicking a copy button writes the raw value and flags .copied", async () => {
    const calls = [];
    const { $$ } = await boot({ clipboard: calls });
    const btn = cardByTitle($$, "Bay Plumbers").querySelector(".contact-copy");
    btn.click();
    await Promise.resolve(); // let clipboard.writeText resolve
    expect(calls).toEqual(["(408) 713-2939"]);
    expect(btn.classList.contains("copied")).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe("Copied");
  });
});
