# 09 — Chaos Collection: cosmetics and Mystery Cards (Sprints 4–5, not Sprint 1)

## Principles

Cosmetic only (no scoring or gameplay effect); original art; data-driven catalog; server-authoritative
inventory and rewards; **no paid randomness**; animations optional and never delay a rematch.

## Catalog

`content/cosmetics.json` (validated like questions), each item: `id`, `slot`, `name`, `assetVersion`,
`layers` (SVG/WebP), `rarity` (cosmetic label only), `source` (`default` | `earnable` | `purchasable-later`),
`reducedMotionVariant`. Slots from the spec: base avatar, palette, expression, hat, accessory, frame, lobby
background, profile background, emote, entrance effect, victory effect, reveal effect.

Rendering: layered SVG composed client-side; missing/unknown item → default layer (graceful fallback).
**Performance budget:** avatar ≤ 30 KB total, ≤ 3 animated layers, no animation on the TV's low-power path.

## Guests vs accounts

Guests pick a session cosmetic set (stored on the `players` row, gone with the room). Persistent inventory
requires an account (Sprint 7); until then, earned cards can't be "owned". **Decision needed:** ship
cosmetics before accounts (session-only) or wait (see [13](13-decisions.md), #4/#5).

## Mystery Cards / Chaos Capsules (free, earnable)

- Earned from milestones (finish a match, 3 rematches in a night, first TV game…), never bought.
- **Reward ledger:** `reward_ledger(id, owner, source_event_id unique, capsule_id, granted_at)`, so a retry can't
  grant twice (same pattern as `grant_entitlement`).
- Opening: server picks from a **published pool with published odds**, seeded and logged in `capsule_openings`;
  duplicates convert to a cosmetic currency or re-roll (decision for Sprint 5).
- Card opening animation: skippable, reduced-motion variant, off on TV.

## Later monetization (needs separate approval)

Direct-purchase themes/avatar bundles (not random), using the existing PayMongo verification and
`owned_packs`-style ownership. No new checkout before validation.
