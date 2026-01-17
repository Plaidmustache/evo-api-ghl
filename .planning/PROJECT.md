# evo-api-ghl

## What This Is

WhatsApp-to-GHL (GoHighLevel) adapter for healthcare practices. Bridges Evolution API (WhatsApp) with GHL CRM, enabling patient communication via WhatsApp from within GHL. Handles all WhatsApp identifier formats including Android @lid identifiers and provides real message status tracking.

## Core Value

**Every patient message reaches the practice, and practitioners see real delivery/read status.**

Healthcare communication cannot silently fail. Lost messages mean missed appointments, delayed care, and broken trust.

## Requirements

### Validated

- OAuth 2.0 integration with GHL (automatic token refresh) — existing
- Multi-tenant architecture (multiple GHL locations, multiple WhatsApp instances per location) — existing
- Inbound message flow: WhatsApp → Evolution API → adapter → GHL conversation — existing
- Outbound message flow: GHL → adapter → Evolution API → WhatsApp — existing
- Instance management API (create, list, delete, update instances) — existing
- Custom page UI embedded in GHL — existing
- Webhook validation guards — existing
- Contact upsert (find or create GHL contacts from WhatsApp messages) — existing
- LID-01: Messages from @lid identifiers (Android users) correctly processed — v1.0
- LID-02: Phone numbers extracted from @lid, @c.us, @g.us, @s.whatsapp.net formats — v1.0
- LID-03: @lid messages logged with warning for monitoring — v1.0
- STATUS-01: SentMessage table stores GHL↔Evolution message ID correlation — v1.0
- STATUS-02: Message mapping created when outbound message sent — v1.0
- STATUS-03: MESSAGES_UPDATE webhooks enabled in controller filter — v1.0
- STATUS-04: Status webhooks processed and mapped to GHL status — v1.0
- STATUS-05: GHL message status updated with real delivered/read timestamps — v1.0
- STATUS-06: Fake status updates removed (no more setTimeout/hardcoded "delivered") — v1.0

### Active

(None — next milestone TBD)

### Out of Scope

- Evolution API changes — adapter-layer fixes only
- New features beyond bug fixes — v1.0 was bug fixes only
- UI changes — backend fixes only
- Performance optimization — correctness first
- Comprehensive test suite — targeted tests only

## Context

**Current State (v1.0 shipped):**

Shipped v1.0 with ~5,569 LOC TypeScript. Tech stack: NestJS 11, Prisma 6.6, MySQL 8.0.

**v1.0 solved two critical bugs:**
1. **@lid message loss** — Android WhatsApp users (~30-40%) were silently dropping messages due to regex that didn't handle @lid format. Now uses `split('@')[0]` for all JID formats.
2. **Fake status** — GHL showed hardcoded "delivered" after 5 seconds instead of real status. Now tracks actual delivered/read via MESSAGES_UPDATE webhooks.

**Operational Notes:**
- Run `prisma migrate deploy` on production for SentMessage table
- Monitor for @lid warnings (new visibility)
- Consider `cleanupOldSentMessages()` cron job (tech debt)

## Constraints

- **Stack**: NestJS 11, Prisma 6.6, MySQL 8.0, TypeScript 5.7 — existing stack
- **Dependencies**: None — all fixes are adapter-layer, no Evolution API changes needed
- **Deployment**: Docker-based, migrations run on startup
- **Backwards Compatibility**: Existing `Instance` and `User` models preserved

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `split('@')[0]` not regex for phone extraction | Handles all JID formats (@lid, @c.us, @g.us, @s.whatsapp.net) uniformly | Good — v1.0 |
| Add SentMessage table with Evolution ID as unique index | Enables fast lookup when status webhooks arrive | Good — v1.0 |
| Remove fake status, rely on real webhooks | Truthful status is better than false confidence | Good — v1.0 |
| Add jid.utils.ts utility file | Centralizes JID handling, prevents future regex drift | Good — v1.0 |
| Best-effort status updates (no throw on errors) | Status tracking shouldn't break message flow | Good — v1.0 |
| SentMessage without local status field | Forward status directly to GHL, don't duplicate | Good — v1.0 |

---
*Last updated: 2026-01-18 after v1.0 milestone*
