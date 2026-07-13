# Los Altos List

A community services directory for the Los Altos area, auto-generated from a
neighborhood WhatsApp group's recommendations.

## Data

| File | Contents |
|------|----------|
| `data/categories.json` | Service categories with entry/request counts |
| `data/entries.json` | Provider-level entries: name, contact info, and quoted recommendations |
| `data/meta.json` | Generation timestamp, watermark, counts |

Updated daily by an automated pipeline that classifies new group messages
(LLM-based) and merges them into the directory. Every change is a commit, so
the full history is auditable.

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
  "category": "appliance repair",
  "name": "City Master",
  "contact": {"phones": ["(408) 713-2939"], "emails": [], "websites": []},
  "mentions": [{"quote": "...", "by": "Neha", "date": "2026-06-22",
                "msg_id": "...", "type": "contact"}],
  "first_seen": "2026-06-22", "last_seen": "2026-06-22", "mention_count": 1
}
```
