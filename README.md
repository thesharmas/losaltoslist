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

`categories.json` / `entries.json` / `meta.json` are regenerated daily by an
automated pipeline that classifies new group messages (LLM-based) and merges
them into the directory. Every change is a commit, so the full history is
auditable.

The other three files are deliberately **not** written by the daily export —
they belong to the self-tuning loops described under
[Automation](#automation). All are optional (the site and build work without
them) and keys starting with `_` are ignored.

Consuming this data with an LLM or agent? See [`AGENTS.md`](AGENTS.md) for a
machine-oriented guide and raw data URLs.

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
- **SEO surface** — the SPA is hash-routed, so `scripts/build-seo.mjs`
  generates the crawlable side at deploy time: indexable category pages
  (`c/<slug>.html`, only for categories with 3+ providers) with real quotes
  and `ItemList`/`BreadcrumbList` JSON-LD, plus `sitemap.xml` (lastmod from
  category activity) and `robots.txt`. Share stubs stay `noindex`; category
  pages are the pages search engines rank.

### Search

Search is tiered so results stay precise but typos and vocabulary gaps still
land:

1. **Exact tier** — case-insensitive substring match over provider names,
   category names, category synonyms (`data/synonyms.json`), recommendation
   quotes, and recommender first names.
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
`sort_changed`, `scroll_depth`, `recommendation_expanded`, `contact_clicked`,
`contact_copied`, `card_shared`, and `card_link_opened`. The zero-result
search stream is what drives the weekly synonym updates.

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
under `test/` (13 files, 119 tests: loading, state, filtering, search
fuzziness, synonyms, rendering, multi-category, share flows, analytics,
security, helpers, the share stubs, and the SEO surface — sitemap, robots,
category pages, overrides). The tests load the real `index.html`
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
(`scripts/build-stubs.mjs`) and the SEO surface — category pages, sitemap,
robots (`scripts/build-seo.mjs`) — then publishes the static site to GitHub
Pages at [losaltos.space](https://losaltos.space). A red test run blocks the
deploy, so the live site never ships on a failing build.

The site is registered in Google Search Console (domain property, verified
via DNS TXT) with the sitemap submitted; Search Console data feeds the weekly
SEO learner.

## Privacy

- Recommenders appear as **first name only** — no phone numbers, emails, or
  handles of community members are ever published.
- Contact details shown are **only those of service providers**, as shared in
  the group for that purpose.
- Requests ("does anyone know a plumber?") are counted per category but their
  text and authors are not published.

To request removal of an entry, open an issue.

## Schema (v1)

```jsonc
// entries.json
{
  "id": "city-master",
  "category": "appliance repair",          // primary (most-mentioned) category
  "categories": ["appliance repair"],      // all category memberships
  "name": "City Master",
  "contact": {"phones": ["(408) 713-2939"], "emails": [], "websites": []},
  "mentions": [{"quote": "...", "by": "Neha", "date": "2026-06-22",
                "msg_id": "...", "type": "contact"}],
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
