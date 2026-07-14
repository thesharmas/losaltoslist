// Load lifecycle: skeleton, meta rendering, and the fetch-error state.
import { afterEach, describe, expect, test } from "vitest";
import { boot, closeAll, META } from "./harness.js";

afterEach(closeAll);

describe("meta rendering", () => {
  test("stamp shows the meta entry_count and build date", async () => {
    const { document } = await boot();
    const stamp = document.getElementById("stamp").textContent;
    expect(stamp).toContain("371"); // META.entry_count
    expect(stamp).toContain("listings");
    expect(stamp).toContain("Jul 14, 2026");
  });

  test("footer meta shows message and category counts", async () => {
    const { document } = await boot();
    const foot = document.getElementById("foot-meta").textContent;
    expect(foot).toContain("2049"); // message_count
    expect(foot).toContain("166"); // category_count
  });

  test("group name from meta populates the brand and footer", async () => {
    const { document } = await boot();
    expect(document.getElementById("brand-group").textContent).toBe("DOLAH Nagar");
    expect(document.getElementById("foot-group").textContent).toBe("DOLAH Nagar");
  });

  test("falls back to live entry count when meta is missing", async () => {
    const { document } = await boot({ meta: null });
    // meta.json 404s -> renderMeta(null) returns early, stamp keeps its "—".
    // The board still renders from entries, so the count line reflects them.
    expect(document.getElementById("result-count").textContent).toContain("5 names");
  });

  test("uses the live entry count in the stamp when meta omits entry_count", async () => {
    const partial = { ...META };
    delete partial.entry_count;
    const { document } = await boot({ meta: partial });
    expect(document.getElementById("stamp").textContent).toContain("5"); // state.entries.length
  });
});

describe("error state", () => {
  test("a failed entries fetch shows the recovery notice", async () => {
    const { $ } = await boot({
      fetchImpl: () => Promise.reject(new Error("network down")),
    });
    expect($(".notice h3").textContent).toContain("Couldn’t load the list");
    expect($("#retry")).toBeTruthy();
  });

  test("a non-ok entries response also triggers the error state", async () => {
    const { $ } = await boot({ entries: null }); // entries.json -> 404
    expect($(".notice h3").textContent).toContain("Couldn’t load the list");
  });
});

describe("empty dataset", () => {
  test("zero entries renders the empty notice rather than cards", async () => {
    const { $, $$ } = await boot({ entries: [] });
    expect($$(".card:not(.skeleton)").length).toBe(0);
    expect($(".notice")).toBeTruthy();
  });
});
