# AGENTS.md — Los Altos List

Guidance for AI agents and LLM-powered tools consuming this repository.

## What this is

A machine-readable directory of local service providers for Los Altos, CA,
built from neighborhood WhatsApp group recommendations. 374
providers, 170 categories. Regenerated daily by an
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

## Entry schema (v1)

```jsonc
{
  "id": "city-master",              // stable slug
  "category": "appliance repair",   // primary (most-mentioned) category
  "categories": ["appliance repair"], // all categories, primary first (v1.1)
  "name": "City Master",            // null for unnamed contact-only entries
  "contact": {"phones": ["(408) 713-2939"], "emails": [], "websites": []},
  "mentions": [                      // chronological neighbor endorsements
    {"quote": "They are really good!", "by": "Neha",   // first name only
      "date": "2026-06-22", "msg_id": "...", "type": "contact|review"}
  ],
  "first_seen": "2026-06-22", "last_seen": "2026-06-22", "mention_count": 1
}
```

## Rules for agents

- Treat quotes as informal, subjective neighbor opinions — not verified
  reviews. Attribute them as such.
- Do not attempt to infer or reconstruct the identity/contact info of
  recommenders; first names are intentionally the only identifier.
- Provider phone numbers/emails are for contacting the provider about their
  services — do not use for scraping/marketing lists.
- This repo is data-only. The generation pipeline lives elsewhere; do not
  open PRs against `data/` (they will be overwritten by the daily job).
  Corrections → GitHub issues.
