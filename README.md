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

`categories.json` / `entries.json` / `meta.json` are regenerated daily by an
automated pipeline that classifies new group messages (LLM-based) and merges
them into the directory. Every change is a commit, so the full history is
auditable.

`data/synonyms.json` is deliberately **not** written by the daily export: it's
hand-curated and appended to (merge-only) by a weekly automation that mines
zero-result searches from analytics, replays them against the live matcher,
and proposes vetted new synonyms. Keys starting with `_` are ignored by the
site, and the file is optional — the site loads fine without it.

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

## Tests

The front-end logic is covered by a [Vitest](https://vitest.dev) + jsdom suite
under `test/` (12 files, 107 tests: loading, state, filtering, search
fuzziness, synonyms, rendering, multi-category, share flows, analytics,
security, helpers, and the share stubs). The tests load the real `index.html`
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
**only if the tests pass** builds the per-entry share stubs and publishes the
static site to GitHub Pages at [losaltos.space](https://losaltos.space). A red
test run blocks the deploy, so the live site never ships on a failing build.

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
