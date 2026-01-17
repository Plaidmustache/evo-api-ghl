# Roadmap: evo-api-ghl Bug Fixes

## Overview

This roadmap delivers two critical bug fixes for the WhatsApp-to-GHL adapter: @lid identifier handling (preventing silent message loss for Android users) and real message status tracking (replacing fake delivery confirmations with actual read receipts). The fixes proceed in dependency order: @lid handling and database schema can run in parallel, then status webhook flow builds on the schema.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: @lid Handling** - Fix phone extraction for Android users
- [ ] **Phase 2: Database Schema** - Add MessageMapping table for status correlation
- [ ] **Phase 3: Status Webhook Flow** - Enable and handle real delivery/read status

## Phase Details

### Phase 1: @lid Handling
**Goal**: Messages from Android WhatsApp users reach GHL with valid phone numbers
**Depends on**: Nothing (first phase)
**Requirements**: LID-01, LID-02, LID-03, LID-04
**Success Criteria** (what must be TRUE):
  1. Message from Android user (@lid identifier) appears in GHL conversation
  2. Contact created with valid phone number (no @lid suffix in GHL)
  3. Logs show warning when @lid identifier processed
  4. Reply from GHL reaches the Android user
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md - Create JID utilities and fix phone extraction

### Phase 2: Database Schema
**Goal**: Message ID correlation table exists and Prisma service can read/write mappings
**Depends on**: Nothing (can run parallel with Phase 1)
**Requirements**: STATUS-01, STATUS-02, STATUS-03, STATUS-04, STATUS-05, STATUS-06
**Success Criteria** (what must be TRUE):
  1. MessageMapping table exists in database with evolutionMessageId as unique index
  2. Instance model has relation to MessageMapping (cascade delete works)
  3. PrismaService can create, find, and update message mappings
**Plans**: TBD

Plans:
- [ ] 02-01: Add MessageMapping model and run migration
- [ ] 02-02: Add PrismaService methods for message mapping

### Phase 3: Status Webhook Flow
**Goal**: GHL shows real delivered/read status based on Evolution API webhooks
**Depends on**: Phase 2
**Requirements**: STATUS-07, STATUS-08, STATUS-09, STATUS-10, STATUS-11, STATUS-12, STATUS-13
**Success Criteria** (what must be TRUE):
  1. Outbound message creates MessageMapping record with Evolution ID
  2. MESSAGES_UPDATE webhook updates GHL message status to delivered/read
  3. Message status in GHL reflects actual delivery state (not hardcoded)
  4. No false "delivered" status within 5 seconds of sending
  5. Failed messages show failed status in GHL
**Plans**: TBD

Plans:
- [ ] 03-01: Store message mapping after send
- [ ] 03-02: Enable and handle status webhooks
- [ ] 03-03: Remove fake status updates

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3
(Phase 1 and 2 have no dependencies, but execute sequentially for focus)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. @lid Handling | 1/1 | Complete ✓ | 2025-01-17 |
| 2. Database Schema | 0/2 | Not started | - |
| 3. Status Webhook Flow | 0/3 | Not started | - |

---
*Roadmap created: 2025-01-17*
*Last updated: 2025-01-17 — Phase 1 complete*
