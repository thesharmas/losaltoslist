// The events pane: data/events.json -> "Next up" ticker, month-grouped agenda,
// promos, and the #view=events route. events.json comes from a second pipeline,
// so the absent/malformed cases matter as much as the happy path.
import { afterEach, describe, expect, it } from "vitest";
import { EVENTS, boot, closeAll } from "./harness.js";

afterEach(closeAll);

// EVENTS fixture dates: 2026-07-16 (community), 07-18–19 (regional), 08-22 (local)
const NOW = "2026-07-14";

describe("loading events.json", () => {
  it("renders the ticker, the tab count, the agenda and the promos", async () => {
    const { $, $$ } = await boot({ events: EVENTS, now: NOW });

    expect($("#tab-ev-n").textContent).toBe("3");
    expect($("#ev-ticker").hidden).toBe(false);
    // the two soonest, by name, not just a count
    expect($("#ev-ticker").textContent).toContain("DOLAH Dandiya Night");
    expect($("#ev-ticker").textContent).toContain("Festival of India");
    expect($("#ev-ticker").textContent).toContain("All 3");

    expect($$("#ev-agenda .ev-card").length).toBe(3);
    expect($("#ev-promos").hidden).toBe(false);
    expect($$("#ev-promo-grid .ev-card").length).toBe(2);
  });

  it("sorts events by start date and groups them under month headings", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    expect($$(".ev-month").map((h) => h.textContent)).toEqual(["July 2026", "August 2026"]);
    expect($$("#ev-agenda .ev-title").map((h) => h.textContent)).toEqual([
      "DOLAH Dandiya Night", "Festival of India", "Craft Fair <script>alert(1)</script>",
    ]);
  });

  it("leaves the directory untouched when events.json is missing", async () => {
    const { $, $$ } = await boot(); // no events payload -> 404, like prod today
    expect($$("#grid .card").length).toBe(5);
    expect($("#ev-ticker").hidden).toBe(true);
    expect($("#tab-ev-n").textContent).toBe("0");
    expect($("#ev-promos").hidden).toBe(true);
    expect($("#ev-agenda").textContent).toContain("Nothing on the calendar");
  });

  it("survives a malformed payload without breaking the board", async () => {
    const { $, $$ } = await boot({ events: { events: "not-an-array", promos: null }, now: NOW });
    expect($$("#grid .card").length).toBe(5);
    expect($("#ev-ticker").hidden).toBe(true);
    expect($("#tab-ev-n").textContent).toBe("0");
  });
});

describe("event card content", () => {
  it("formats single, multi-day and recurring dates", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    const dates = $$("#ev-agenda .ev-date").map((d) => d.textContent);
    expect(dates[0]).toBe("Thu, Jul 16");
    expect(dates[1]).toBe("Sat, Jul 18–19"); // same month collapses to a range
    expect($$("#ev-agenda .ev-bits")[2].textContent).toContain("every Sunday");
  });

  it("counts down only for the near horizon", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    const cards = $$("#ev-agenda .ev-card");
    expect(cards[0].querySelector(".ev-soon").textContent).toBe("In 2 days");
    expect(cards[1].querySelector(".ev-soon").textContent).toBe("In 4 days");
    expect(cards[2].querySelector(".ev-soon")).toBeNull(); // 5+ weeks out
  });

  it("marks group-hosted events as ours and labels the others by reach", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    const cards = $$("#ev-agenda .ev-card");
    expect(cards[0].classList.contains("ev-ours")).toBe(true);
    expect(cards[1].classList.contains("ev-ours")).toBe(false);
    expect(cards[0].querySelector(".ev-kind").textContent).toContain("Our group");
    expect(cards[1].querySelector(".ev-kind").textContent).toContain("Bay Area");
    expect(cards[2].querySelector(".ev-kind").textContent).toContain("Los Altos");
  });

  it("shows venue, city and organizer when the extractor found them", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    const card = $$("#ev-agenda .ev-card")[0];
    expect(card.querySelector(".ev-where").textContent).toBe("Grant Park Community Center, Los Altos");
    expect($$("#ev-agenda .ev-card")[1].querySelector(".ev-org").textContent).toBe("FOG");
  });
});

describe("events are untrusted input", () => {
  it("escapes titles and descriptions rather than executing them", async () => {
    const { $, $$, document } = await boot({ events: EVENTS, now: NOW });
    expect(document.querySelector("#ev-agenda script")).toBeNull();
    expect($("#ev-agenda").innerHTML).toContain("&lt;script&gt;");
    // ...while still reading correctly as text on the card
    expect($$("#ev-agenda .ev-title")[2].textContent)
      .toBe('Craft Fair <script>alert(1)</script>');
    expect($$("#ev-agenda .ev-desc")[2].textContent).toBe('Quotes "and" <b>tags</b>.');
  });

  it("refuses a javascript: url instead of linking to it", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    const xssCard = $$("#ev-agenda .ev-card")[2];
    expect(xssCard.querySelector(".ev-link")).toBeNull();
    // a real https url still becomes a link
    expect($$("#ev-agenda .ev-card")[1].querySelector(".ev-link").getAttribute("href"))
      .toBe("https://fogsv.com/event/");
  });

  // The export no longer emits promo contacts (they were neighbours' personal
  // mobiles and gmails). The renderer is the second line of defence: a
  // pipeline regression must not be able to put them back on the page.
  it("never renders a promo contact, even when the data still carries one", async () => {
    const { $, $$ } = await boot({ events: EVENTS, now: NOW });
    // EVENTS.promos[0].contact is "ranvinder910@gmail.com, +1 408-480-6164"
    expect($("#ev-promo-grid").innerHTML).not.toContain("ranvinder910");
    expect($("#ev-promo-grid").innerHTML).not.toContain("408-480-6164");
    expect($$("#ev-promo-grid a[href^='mailto:']")).toHaveLength(0);
    expect($$("#ev-promo-grid a[href^='tel:']")).toHaveLength(0);
  });

  it("never renders posted_by, even when the data still carries one", async () => {
    const { $ } = await boot({ events: EVENTS, now: NOW });
    expect($("#ev-promo-grid").textContent).not.toContain("Nehal");
    expect($("#ev-agenda").textContent).not.toContain("Shalini");
    expect($("#pane-events").textContent).not.toContain("Shared by");
  });

  it("still links a promo's own website, upgrading a bare domain", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    expect($$("#ev-promo-grid .ev-card")[1].querySelector(".ev-link").getAttribute("href"))
      .toBe("https://www.backyardnourish.com");
  });

  it("gives a promo with no website no dangling footer rule", async () => {
    const { $$ } = await boot({ events: EVENTS, now: NOW });
    // promos[0] has no url — it must not render an empty bordered .ev-foot
    expect($$("#ev-promo-grid .ev-card")[0].querySelector(".ev-foot")).toBeNull();
    expect($$("#ev-promo-grid .ev-card")[1].querySelector(".ev-foot")).not.toBeNull();
  });
});

describe("switching panes", () => {
  it("starts on the directory and swaps to events on tab click", async () => {
    const { $ } = await boot({ events: EVENTS, now: NOW });
    expect($("#pane-directory").hidden).toBe(false);
    expect($("#pane-events").hidden).toBe(true);

    $("#tab-events").click();
    expect($("#pane-directory").hidden).toBe(true);
    expect($("#pane-events").hidden).toBe(false);
    expect($("#tab-events").getAttribute("aria-selected")).toBe("true");
  });

  it("puts the pane in the hash so the view can be shared", async () => {
    const { $, window } = await boot({ events: EVENTS, now: NOW });
    $("#tab-events").click();
    expect(window.location.hash).toContain("view=events");
    $("#tab-directory").click();
    expect(window.location.hash).not.toContain("view=events");
  });

  it("opens straight into events from #view=events", async () => {
    const { $ } = await boot({ events: EVENTS, now: NOW, hash: "#view=events" });
    expect($("#pane-events").hidden).toBe(false);
    expect($("#pane-directory").hidden).toBe(true);
  });

  it("lets a deep-linked provider card win over a stale view=events", async () => {
    const { $ } = await boot({
      events: EVENTS, now: NOW, hash: "#view=events&e=bay-plumbers",
    });
    expect($("#pane-directory").hidden).toBe(false);
    expect($("#pane-events").hidden).toBe(true);
  });

  it("jumps to the pane from the ticker's all-events button", async () => {
    const { $ } = await boot({ events: EVENTS, now: NOW });
    $("#ev-ticker .tk-all").click();
    expect($("#pane-events").hidden).toBe(false);
  });
});

describe("events analytics", () => {
  it("reports pane switches with how they were reached", async () => {
    const posthog = [];
    const { $ } = await boot({ events: EVENTS, now: NOW, posthog });
    $("#ev-ticker .tk-all").click();
    $("#tab-directory").click();
    const panes = posthog.filter((e) => e.name === "pane_changed");
    expect(panes.map((e) => [e.props.pane, e.props.via])).toEqual([
      ["events", "ticker"], ["directory", "tab"],
    ]);
  });

  it("reports outbound event link clicks, tagged with the surface", async () => {
    const posthog = [];
    const { $$ } = await boot({ events: EVENTS, now: NOW, posthog });
    $$("#ev-agenda .ev-card")[1].querySelector(".ev-link").click();
    const hit = posthog.find((e) => e.name === "event_link_opened");
    expect(hit.props).toMatchObject({
      event_id: "evt_multiday", kind: "regional", surface: "app",
    });
  });

  // the denominator: without it, "nobody clicked" and "nothing to click"
  // are the same shape in the data
  it("reports what was on offer once per pageview", async () => {
    const posthog = [];
    await boot({ events: EVENTS, now: NOW, posthog });
    const avail = posthog.filter((e) => e.name === "events_available");
    expect(avail).toHaveLength(1);
    expect(avail[0].props).toEqual({
      events_count: 3,
      promos_count: 2,
      local_count: 2,      // community + local; the Fremont one doesn't count
      ticker_shown: true,
      days_to_next: 2,
    });
  });

  it("still reports availability when there are no events at all", async () => {
    const posthog = [];
    await boot({ posthog }); // events.json 404s
    const avail = posthog.filter((e) => e.name === "events_available");
    expect(avail).toHaveLength(1);
    expect(avail[0].props).toMatchObject({
      events_count: 0, promos_count: 0, ticker_shown: false, days_to_next: null,
    });
  });

  it("reports a promo's website click", async () => {
    const posthog = [];
    const { $$ } = await boot({ events: EVENTS, now: NOW, posthog });
    $$("#ev-promo-grid .ev-card")[1].querySelector(".ev-link").click();
    expect(posthog.find((e) => e.name === "promo_link_opened").props)
      .toEqual({ promo_id: "prm_two", business: "Backyard Nourish" });
    // there are no promo contacts to click any more
    expect(posthog.filter((e) => e.name === "promo_contact_clicked")).toHaveLength(0);
  });

  it("attributes an arrival from events.html", async () => {
    const posthog = [];
    await boot({ events: EVENTS, now: NOW, posthog, hash: "#view=events&via=events" });
    expect(posthog.find((e) => e.name === "arrived_from").props)
      .toEqual({ via: "events", category_slug: null, entry_id: null, view: "events" });
  });

  it("attributes an arrival from a category page", async () => {
    const posthog = [];
    await boot({ posthog, hash: "#c=plumbing&via=cat" });
    expect(posthog.find((e) => e.name === "arrived_from").props)
      .toMatchObject({ via: "cat", category_slug: "plumbing" });
  });

  it("stays quiet for direct visits and refuses an invented source", async () => {
    const posthog = [];
    await boot({ posthog, hash: "#c=plumbing&via=totally-made-up" });
    expect(posthog.filter((e) => e.name === "arrived_from")).toHaveLength(0);
  });
});
