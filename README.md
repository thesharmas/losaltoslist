# Los Altos List

A community services directory for the Los Altos area, auto-generated from a
neighborhood WhatsApp group's recommendations. Live at
[losaltos.space](https://losaltos.space).

## Data

| File | Contents |
|------|----------|
| `data/categories.json` | Service categories with entry/request counts |
| `data/entries.json` | Provider-level entries: name, contact info, category memberships, and quoted recommendations |
| `data/meta.json` | Generation timestamp, watermark, counts |
| `data/synonyms.json` | Curated search synonyms: category slug → extra words/phrases the search matches for that category |
| `data/seo-overrides.json` | Per-category `<title>`/meta-description overrides for the generated category pages |
| `data/seo-experiments.json` | Audit ledger of SEO title/description experiments (baseline metrics + outcomes) |
| `data/events.json` | Upcoming community events + live local-business promos, with dates for UI display (see [Events](#events)) |

`categories.json` / `entries.json` / `meta.json` are regenerated daily by an
automated pipeline that classifies new group messages (LLM-based) and merges
them into the directory. Every change is a commit, so the full history is
auditable.

`events.json` is regenerated nightly by a separate pipeline (see
[Events](#events)); it shares the commit-per-change audit model.

The other SEO/search files are deliberately **not** written by the daily export —
they belong to the self-tuning loops described under
[Automation](#automation). All are optional (the site and build work without
them) and keys starting with `_` are ignored.

Consuming this data with an LLM or agent? See [`AGENTS.md`](AGENTS.md) for a
machine-oriented guide and raw data URLs.

## Events

`data/events.json` is produced by a second nightly pipeline that sweeps three
neighborhood WhatsApp groups (the main group plus two events-focused sister
groups) for **dated community events** and **local business promos**:

- **Text + flyer images.** Event flyers are downloaded same-day (WhatsApp
  media expires server-side after a few weeks) and parsed with a vision
  model; text announcements go through an LLM classifier with thread context.
- **Schema.** Each event has `title`, `start_date`/`end_date` (`YYYY-MM-DD`,
  America/Los_Angeles), `time`, `venue`, `city`, `organizer`, `cost`, `url`,
  `recurrence`, and a `kind` of `community` (group-hosted), `local`
  (Los Altos / Los Altos Hills), or `regional` (wider Bay Area). Promos have
  `name`, `what`, `url`, and an `expires` date. Neither carries who posted it,
  and promos carry no phone or email — those were neighbors' personal numbers,
  not business lines, so a promo is reachable through its own site or not at
  all. `index.html` refuses to render either field even if the data regresses.
- **Expiry.** Past events (ended before yesterday) drop out of the file
  automatically; promos expire 60 days after their last sighting unless
  re-posted. Full history stays in the private source repo.
- **Quality gates.** Only high-confidence extractions are published; ticket
  resale, ISO posts, and service-recommendation chatter are excluded by
  design (the directory covers providers).

## Front end

The site is a single static `index.html` (vanilla JS, no framework, no build
step) that fetches the JSON in `data/` and renders the directory. Serve it
over HTTP to develop locally — opening the file from disk won't work because
the browser blocks the `fetch`:

```
python3 -m http.server   # then visit http://localhost:8000
```

Features:

- **Category browsing** — providers that span multiple categories (e.g.
  landscaper + contractor) appear under every category they belong to.
- **Sorting** — most loved (mention count) or most recent.
- **Share cards** — each entry has a shareable link; `scripts/build-stubs.mjs`
  generates a static OpenGraph stub page per entry (`e/<id>.html`) at deploy
  time so shared links get proper previews in WhatsApp/iMessage/Slack (chat
  crawlers don't execute JS), then redirect humans to the real card.
- **Events pane** — a second tab (`🗂️ The list` / `📅 What's on`) renders
  `data/events.json` as a month-grouped agenda plus a promos section. The
  directory hero carries a **"Next up" ticker** naming the two soonest events,
  so the calendar advertises itself without a click. The pane is part of the
  hash state (`#view=events`), so the view is shareable and survives a reload;
  a deep-linked provider card (`#e=<id>`) always wins over a stale
  `view=events`. The whole surface is optional — if `events.json` is missing or
  malformed, the ticker and promos stay hidden and the directory is untouched.
- **SEO surface** — the SPA is hash-routed, so `scripts/build-seo.mjs`
  generates the crawlable side at deploy time: indexable category pages
  (`c/<slug>.html`, only for categories with 3+ providers) with real quotes
  and `ItemList`/`BreadcrumbList` JSON-LD, an `events.html` with per-event
  `Event` JSON-LD (the rich result the directory can't earn), plus
  `sitemap.xml` (lastmod from category activity) and `robots.txt`. Share stubs
  stay `noindex`; category and event pages are what search engines rank.
  Events are ordered local-first — Los Altos and Los Altos Hills lead, wider
  Bay Area postings follow, each with its true location in the markup — and
  the page is only written when there is at least one upcoming event, since a
  thin events page is worse than none.

### Search

Search is tiered so results stay precise but typos and vocabulary gaps still
land:

1. **Exact tier** — case-insensitive substring match over provider names,
   category names, category synonyms (`data/synonyms.json`), and
   recommendation quotes.
2. **Fuzzy fallback** — only when the exact tier returns zero hits. Each query
   token is matched per-word (names, categories, synonyms) with a bounded
   edit distance (insertions/deletions/substitutions/transpositions) and
   prefix matching for incremental typing. Typo budget scales with token
   length: under 4 chars must match exactly, 4–6 chars allow 1 edit, 7+ allow
   2\. Rescued results are labeled "closely matching".

Because synonyms feed both tiers, a typo of a synonym (e.g. `irigation`) still
finds the right category. Quoted queries (`"exact phrase"`) skip the fuzzy
fallback.

### Analytics

Anonymous PostHog custom events instrument the funnel: `search` (with
`results_count` plus `fuzzy`/`synonyms` flags marking which tier produced the
hits), `search_no_results`, `category_filter`, `cat_tag_clicked`,
`sort_changed`, `scroll_depth` (carrying the `pane` it happened in, since the
two views have very different heights), `recommendation_expanded`,
`contact_clicked`, `contact_copied`, `card_shared`, and `card_link_opened`.
The zero-result search stream is what drives the weekly synonym updates.

The events surface adds:

| Event | Answers |
|-------|---------|
| `events_available` | Fired once per pageview *including when there's nothing to show* — counts, `local_count`, `ticker_shown`, `days_to_next`. The denominator: without it, "nobody clicked" and "nothing to click" look identical. |
| `pane_changed` | Did they open the calendar, and did the tab or the ticker get them there (`via`)? |
| `event_link_opened` | Which events are worth a click. `surface` separates the app from `events.html`. |
| `promo_link_opened` | A promo has no card to open, so a click through to its own site is the whole conversion. |

**The static surface.** The generated pages are what search engines actually
rank, so they carry PostHog too (`analyticsSnippet()`), with a `surface` super
property of `category_page` or `events_page`. Every link off those pages is
tagged via a `data-track` attribute that `analyticsWiring()` reads back on
click — `seo_handoff` (into the app: home, directory, calendar, a specific
provider), `seo_internal_link` (sideways to a sibling category),
`seo_outbound` (off-site), plus `contact_clicked` and `event_link_opened`
sharing the app's names so both surfaces are directly comparable.
`trackAttrs()` renders those attributes: underscored keys become dashed
attributes and round-trip back to snake_case props, since `dataset` hands
everything back camelCased.

Two rules hold there. Nothing goes in a `data-*` attribute that shouldn't be
sent — `contact_clicked` on a phone link reports `method: "phone"` and the
business, never the number, matching the app. And the **share stubs
(`e/<id>.html`) deliberately have no PostHog**: they `location.replace()` on
load, so a pageview there would be a wasted duplicate of the landing the app
already records.

**Attribution.** The crawlable pages hand off to the SPA, so without a marker
the pages doing the ranking looked like they converted nobody. Every hand-off
carries `via=` (`share` | `cat` | `events`) and the app fires `arrived_from` on
landing with the source, category and entry. Unknown values collapse to
`direct`, so a hand-typed `?via=` can't invent a traffic source.

## Automation

Beyond the daily data pipeline, two weekly closed loops tune the site from
real usage data. In both, an LLM only *proposes*; a validating script owns
every guardrail, applies accepted changes as commits to `main`, and the
test-gated deploy ships them.

1. **Synonym miner** (weekly) — mines the week's zero-result searches from
   PostHog, replays each against the live matcher (only still-dead queries
   survive), asks an LLM to map them to existing categories, then validates
   (live slug, generic-word blocklist, cross-category collision guard,
   already-covered replay, cap per run) and appends merge-only to
   `data/synonyms.json`. Internal search vocabulary teaches itself.

2. **SEO learner** (weekly) — pulls 28 days of Google Search Console data
   and buckets it: category pages underperforming the expected CTR for their
   position, striking-distance pages (position 5–15), and queries with
   impressions that no category page serves (fed back as synonym/category
   candidates). An LLM proposes at most 3 title/description rewrites; the
   validator enforces length windows, a "must mention Los Altos + the
   category" relevance check, and anti-keyword-stuffing rules, then records
   each accepted change in `data/seo-experiments.json` with its 28-day
   baseline. Two weeks later the loop judges each experiment against Search
   Console again — changes that dropped CTR >20% are **auto-reverted**,
   survivors are kept. Google's own feedback teaches the pages how to be
   found.

## Tests

The front-end logic is covered by a [Vitest](https://vitest.dev) + jsdom suite
under `test/` (14 files, 170 tests: loading, state, filtering, search
fuzziness, synonyms, rendering, multi-category, share flows, analytics,
security, helpers, the share stubs, the events pane — date formatting,
countdowns, pane routing, untrusted event input — and the SEO surface —
sitemap, robots, category pages, the events page, overrides). The tests load
the real `index.html`
into jsdom with a stubbed `fetch` and drive it through the DOM —
`index.html` ships unmodified, with no extracted modules. Regression cases
come from real dead queries observed in analytics.

```
npm ci
npm test          # single run
npm run test:watch
```

## Deployment

Deploys are automated by `.github/workflows/deploy.yml`. On every push to
`main` (including the daily data-pipeline commits) it runs `npm test`, and
**only if the tests pass** builds the per-entry share stubs
(`scripts/build-stubs.mjs`) and the SEO surface — category pages, the events
page, sitemap, robots (`scripts/build-seo.mjs`) — then publishes to GitHub
Pages at [losaltos.space](https://losaltos.space). A red test run blocks the
deploy, so the live site never ships on a failing build.

The site is registered in Google Search Console (domain property, verified
via DNS TXT) with the sitemap submitted; Search Console data feeds the weekly
SEO learner.

## Privacy

- Recommendations are **fully anonymized** — no names, phone numbers, emails,
  handles, or message ids of community members are ever published. Quotes are
  additionally scrubbed of group-member names before export.
- Contact details shown are **only those of service providers**, as shared in
  the group for that purpose.
- Requests ("does anyone know a plumber?") are counted per category but their
  text and authors are not published.
- Community events and promos are published without the name of the member
  who posted them.

To request removal of an entry, open an issue.

## Schema (v2)

```jsonc
// entries.json
{
  "id": "city-master",
  "category": "appliance repair",          // primary (most-mentioned) category
  "categories": ["appliance repair"],      // all category memberships
  "name": "City Master",
  "contact": {"phones": ["(408) 713-2939"], "emails": [], "websites": []},
  "mentions": [{"quote": "...", "date": "2026-06-22", "type": "contact"}],
  "first_seen": "2026-06-22", "last_seen": "2026-06-22", "mention_count": 1
}
```

```jsonc
// synonyms.json — optional, merge-only, keys are category slugs
{
  "_about": "ignored by the site",
  "landscaper": ["irrigation", "sprinkler", "drip system"]
}
```

```jsonc
// seo-overrides.json — optional, keys are category slugs
{
  "_about": "ignored by the build",
  "landscaper": {"title": "...", "description": "..."}
}

// seo-experiments.json — audit ledger for the SEO learner
{
  "experiments": [{"id": "landscaper-title-2026-07-20", "slug": "landscaper",
                   "field": "title", "old": "", "new": "...",
                   "applied_at": "...", "baseline": {"ctr": 0.04, "position": 8.2},
                   "status": "open"}]  // open -> kept | reverted
}
```
