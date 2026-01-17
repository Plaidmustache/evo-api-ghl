# Roadmap: evo-api-ghl Bug Fixes

## Overview

This roadmap delivers two critical bug fixes for the WhatsApp-to-GHL adapter: @lid identifier handling (preventing silent message loss for Android users) and real message status tracking (replacing fake delivery confirmations with actual read receipts). The fixes proceed in dependency order: @lid handling and database schema can run in parallel, then status webhook flow builds on the schema.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: @lid Handling** - Fix phone extraction for Android users
- [x] **Phase 2: Database Schema** - Add SentMessage table for status correlation
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
**Requirements**: STATUS-01, STATUS-02, STATUS-03, STATUS-04, STATUS-05 (STATUS-06 removed)
**Success Criteria** (what must be TRUE):
  1. SentMessage table exists in database with ghlMessageId as unique index
  2. Instance model has relation to SentMessage (cascade delete works)
  3. PrismaService can create and find message mappings
**Plans**: 0 plans (pre-existing implementation discovered)

**Note**: Phase 2 was found to be already implemented. The `SentMessage` model and
`PrismaService` methods were created in a prior session. Migration exists but needs
deployment via `prisma migrate deploy`.

Plans:
- [x] Pre-existing: SentMessage model in schema.prisma
- [x] Pre-existing: Migration 20260113000000_add_sent_messages
- [x] Pre-existing: createSentMessage, findSentMessageByEvolutionId, findSentMessageByGhlId methods

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
**Plans**: 1 plan (verification only - implementation pre-existing)

**Note**: Phase 3 research discovered all requirements (STATUS-07 through STATUS-13) are
already implemented in the codebase. Plan 03-01 verifies implementation correctness rather
than implementing new code.

Plans:
- [ ] 03-01-PLAN.md - Verify status webhook flow implementation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3
(Phase 1 and 2 have no dependencies, but execute sequentially for focus)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. @lid Handling | 1/1 | Complete | 2025-01-17 |
| 2. Database Schema | N/A | Complete (pre-existing) | 2025-01-17 |
| 3. Status Webhook Flow | 0/1 | Ready | - |

---
*Roadmap created: 2025-01-17*
*Last updated: 2025-01-18 — Phase 3 planned (verification only)*
