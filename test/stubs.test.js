// scripts/build-stubs.mjs — static share-stub pages with per-entry OG tags.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStubs, stubHtml } from "../scripts/build-stubs.mjs";
import { CATEGORIES, ENTRIES } from "./harness.js";

let dir;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = null; });

function build(entries = ENTRIES, categories = CATEGORIES) {
  dir = mkdtempSync(join(tmpdir(), "stubs-"));
  const res = buildStubs(entries, categories, dir);
  return { ...res, read: (id) => readFileSync(join(dir, "e", `${id}.html`), "utf8") };
}

describe("buildStubs", () => {
  it("writes one stub per entry into <out>/e/", () => {
    const { written } = build();
    expect(written).toBe(ENTRIES.length);
    expect(readdirSync(join(dir, "e")).sort()).toEqual(
      ENTRIES.map((e) => `${e.id}.html`).sort()
    );
  });

  it("emits per-entry OG tags and a redirect to the card deep link", () => {
    const { read } = build();
    const html = read("bay-plumbers");
    expect(html).toContain("<title>Bay Plumbers — Plumbing · Los Altos List</title>");
    expect(html).toContain('property="og:title" content="Bay Plumbers — Plumbing · Los Altos List"');
    expect(html).toContain("★ Recommended by 3 neighbors");
    expect(html).toContain("Fast and fair."); // first quote in the description
    expect(html).toContain('property="og:url" content="https://losaltos.space/e/bay-plumbers.html"');
    // both redirect paths (crawlers keep the meta, humans take the script);
    // via=share attributes the visit to a shared link in analytics
    expect(html).toContain('http-equiv="refresh" content="0;url=/#c=plumbing&amp;e=bay-plumbers&amp;via=share"');
    expect(html).toContain('location.replace("/#c=plumbing&e=bay-plumbers&via=share");');
    // doorway pages must not compete with the real site in search
    expect(html).toContain('name="robots" content="noindex"');
  });

  it("falls back to website hostname for unnamed entries", () => {
    const { read } = build();
    expect(read("mathwhiz")).toContain("<title>mathwhiz.com — Tutoring · Los Altos List</title>");
  });

  it("HTML-escapes names and quotes in meta tags", () => {
    const { read } = build();
    const html = read("escape-co");
    expect(html).toContain("Escape &amp; Co &lt;x&gt; &quot;test&quot;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("skips entries whose ids could escape the output dir or break URLs", () => {
    const bad = [
      { id: "../evil", category: "plumbing", name: "Evil", contact: {}, mentions: [], mention_count: 1 },
      { id: "", category: "plumbing", name: "Nameless", contact: {}, mentions: [], mention_count: 1 },
      { category: "plumbing", name: "No id", contact: {}, mentions: [], mention_count: 1 },
    ];
    const { written, skipped } = build(bad);
    expect(written).toBe(0);
    expect(skipped.length).toBe(3);
    expect(readdirSync(join(dir, "e"))).toEqual([]);
  });

  it("stubHtml survives entries with no mentions", () => {
    const html = stubHtml(
      { id: "mystery-sparky", category: "electrician", name: null, contact: {}, mentions: [], mention_count: 0 },
      "Electrician"
    );
    expect(html).toContain("A recommended electrician — Electrician · Los Altos List");
    expect(html).toContain("Recommended by a neighbor");
  });
});
