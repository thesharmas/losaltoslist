# AGENTS.md — Los Altos List

Guidance for AI agents and LLM-powered tools consuming this repository.

## What this is

A machine-readable directory of local service providers for Los Altos, CA,
built from neighborhood WhatsApp group recommendations. 487
providers, 195 categories. Regenerated daily by an
automated pipeline; every update is a git commit, so history is auditable.

## How to use the data

1. Read `data/categories.json` to discover categories (use `slug` as key).
2. Read `data/entries.json` and filter by membership in `categories` (matches
   category `name` lowercased). `category` is the primary; some providers span
   several categories (e.g. landscaper + contractor). Entries are sorted by
   primary category, then mention_count desc.
3. Rank within a category by `mention_count` and recency (`last_seen`).
4. Check `data/meta.json` → `generated_at` for data freshness before caching.

Raw URLs (no auth):
`https://raw.githubusercontent.com/thesharmas/losaltoslist/main/data/entries.json`

## Entry schema (v2)

```jsonc
{
  "id": "city-master",              // stable slug
  "category": "appliance repair",   // primary (most-mentioned) category
  "categories": ["appliance repair"], // all categories, primary first (v1.1)
  "name": "City Master",            // null for unnamed contact-only entries
  "contact": {"phones": ["(408) 713-2939"], "emails": [], "websites": []},
  "mentions": [                      // chronological neighbor endorsements
    {"quote": "They are really good!",   // anonymized — no recommender identity
      "date": "2026-06-22", "type": "contact|review"}
  ],
  "first_seen": "2026-06-22", "last_seen": "2026-06-22", "mention_count": 1
}
```

## Events schema (v1)

`data/events.json` is a **separate feed with a different shape** — an object,
not an array. Dated community events plus local-business promos. Past events
are dropped by the pipeline, so treat everything in `events` as upcoming as of
`meta.generated_at`.

```jsonc
{
  "meta": {"generated_at": "...", "upcoming_count": 12, "promo_count": 17},
  "events": [{
    "id": "evt_e8082b426945",
    "title": "Volunteer Kick-off Event",
    "kind": "community",           // community = hosted by the group,
                                   // local = Los Altos / LAH, regional = wider Bay Area
    "start_date": "2026-08-15",    // YYYY-MM-DD, America/Los_Angeles
    "end_date": null,              // null for single-day events
    "time": "10 AM",               // free text, as posted
    "venue": "Town Hall on Fremont Road", "city": "Los Altos Hills",
    "organizer": "Friendsoflah.org", "cost": null, "url": "...",
    "recurrence": null,            // e.g. "every Sunday"
    "description": "..."
  }],
  "promos": [{                     // a neighbor advertising their own business
    "id": "prm_b381a93962dd", "name": "Almari Collective",
    "what": "rent, buy, and sell South Asian occasion wear",
    "url": "almaricollective.com", "description": "...",
    "expires": "2026-10-10"
  }]
}
```

Every field except `id`, `title` and `start_date` may be `null` — the extractor
only fills what the group post actually said. Like `entries.json`, this feed is
anonymized: **who posted an event or promo is never published**, and promos
carry no phone or email (they were personal numbers, not business lines). A
promo is reachable through its own `url` or not at all.

## Rules for agents

- Treat quotes as informal, subjective neighbor opinions — not verified
  reviews. Attribute them as such.
- Do not attempt to infer or reconstruct the identity/contact info of
  recommenders or of whoever posted an event or promo; both are intentionally
  anonymous.
- Events and promos are extracted from chat messages and flyer images by an
  LLM. Verify dates, times and venues against the linked `url` before acting on
  them; a promo is self-promotion, not a neighbor endorsement.
- Provider phone numbers/emails are for contacting the provider about their
  services — do not use for scraping/marketing lists.
- This repo is data-only. The generation pipeline lives elsewhere; do not
  open PRs against `data/` (they will be overwritten by the daily job).
  Corrections → GitHub issues.
