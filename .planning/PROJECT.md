# evo-api-ghl Bug Fixes

## What This Is

Critical bug fixes for an existing WhatsApp-to-GHL (GoHighLevel) adapter used by healthcare practices. The adapter bridges Evolution API (WhatsApp) with GHL CRM, enabling patient communication. Two bugs cause silent message loss and broken read receipts.

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

### Active

- [ ] **LID-01**: Messages from @lid identifiers (Android users) correctly processed
- [ ] **LID-02**: Phone numbers extracted from @lid, @c.us, @g.us, @s.whatsapp.net formats
- [ ] **LID-03**: @lid messages logged with warning for monitoring
- [ ] **STATUS-01**: MessageMapping table stores GHL↔Evolution message ID correlation
- [ ] **STATUS-02**: Message mapping created when outbound message sent
- [ ] **STATUS-03**: MESSAGES_UPDATE webhooks enabled in controller filter
- [ ] **STATUS-04**: Status webhooks processed and mapped to GHL status
- [ ] **STATUS-05**: GHL message status updated with real delivered/read timestamps
- [ ] **STATUS-06**: Fake status updates removed (no more setTimeout/hardcoded "delivered")

### Out of Scope

- Evolution API changes — adapter-layer fixes only
- New features — bug fixes only, no feature additions
- UI changes — backend fixes only
- Performance optimization — correctness first
- Test coverage — will add targeted tests for the fixes

## Context

**The @lid Problem:**
WhatsApp identifies some users (mostly Android, ~30-40% of users) with `@lid` format (`267215769174167@lid`) instead of phone numbers (`31687483489@s.whatsapp.net`). The adapter's regex `/@[cg]\.us$/` only handles `@c.us` and `@g.us`, leaving @lid identifiers intact. This creates invalid phone numbers like `+267215769174167@lid` that GHL rejects, silently dropping the message.

**The Status Problem:**
When a message is sent from GHL:
1. Evolution API returns `idMessage` (e.g., `"3EB03E03EF123456"`)
2. The adapter does NOT store this ID
3. When Evolution API sends `MESSAGES_UPDATE` webhook with delivery/read status, the adapter cannot correlate it back to the GHL message
4. Result: GHL never learns the real status

Currently the adapter lies — it hardcodes "delivered" status immediately after sending, masking real delivery failures.

**Research completed:**
- `.planning/research/task1-lid-research.md` — @lid handling analysis across Evolution API, WAHA, and GREEN-API
- `.planning/research/task2-status-flow-research.md` — status webhook flow analysis
- `.planning/research/fix-action-plan.md` — complete implementation plan with exact code changes

## Constraints

- **Stack**: NestJS 11, Prisma 6.6, MySQL 8.0, TypeScript 5.7 — existing stack, no changes
- **Dependencies**: None — all fixes are adapter-layer, no Evolution API changes needed
- **Deployment**: Docker-based, migrations run on startup
- **Backwards Compatibility**: Existing `Instance` and `User` models must not break

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `split('@')[0]` not regex for phone extraction | Handles all JID formats (@lid, @c.us, @g.us, @s.whatsapp.net) uniformly | — Pending |
| Add MessageMapping table with Evolution ID as unique index | Enables fast lookup when status webhooks arrive | — Pending |
| Remove fake status, rely on real webhooks | Truthful status is better than false confidence | — Pending |
| Add jid.utils.ts utility file | Centralizes JID handling, prevents future regex drift | — Pending |

---
*Last updated: 2025-01-17 after initialization*
