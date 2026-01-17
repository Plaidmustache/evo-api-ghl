---
phase: 03-status-webhook-flow
verified: 2025-01-18T01:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 3: Status Webhook Flow Verification Report

**Phase Goal:** GHL shows real delivered/read status based on Evolution API webhooks
**Verified:** 2025-01-18
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Outbound message creates SentMessage record with Evolution ID | VERIFIED | `createSentMessage` called at ghl.service.ts:737 with guard condition at :735 |
| 2 | MESSAGES_UPDATE webhook updates GHL message status to delivered/read | VERIFIED | `handleMessagesUpdate` at :431-478, routed from switch case at :398 |
| 3 | Message status in GHL reflects actual delivery state (not hardcoded) | VERIFIED | Status comes from `mapEvolutionStatusToGhl` at :483-501, updates via PUT endpoint |
| 4 | No false "delivered" status within 5 seconds of sending | VERIFIED | No `setTimeout` in file (grep returned 0 matches), only "sent" set immediately at :727 |
| 5 | Failed messages show failed status in GHL | VERIFIED | ERROR/FAILED mapped to "failed" at :496-498 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ghl/ghl.service.ts` | Message mapping storage, status handler, status mapper | VERIFIED (863 lines) | createSentMessage at :737, handleMessagesUpdate at :431, mapEvolutionStatusToGhl at :483 |
| `src/ghl/types/evolution-webhook.types.ts` | MESSAGES_UPDATE in allowed events | VERIFIED (239 lines) | Type at :13, ALLOWED_EVOLUTION_EVENTS at :238 |
| `src/prisma/prisma.service.ts` | createSentMessage, findSentMessageByEvolutionId | VERIFIED (217 lines) | createSentMessage at :158, findSentMessageByEvolutionId at :177 |
| `prisma/migrations/20260113000000_add_sent_messages/migration.sql` | SentMessage table creation | VERIFIED (19 lines) | CREATE TABLE with ghlMessageId unique, evolutionMsgId index, CASCADE delete |
| `prisma/schema.prisma` | SentMessage model definition | VERIFIED (61 lines) | Model at :49-60 with Instance relation |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| handleGhlOutboundMessage | prisma.createSentMessage | Message mapping after send | WIRED | :737 calls createSentMessage after Evolution send, with guard `evolutionMsgId !== "sent"` at :735 |
| handleMessagesUpdate | prisma.findSentMessageByEvolutionId | Lookup GHL ID from Evolution ID | WIRED | :450 calls findSentMessageByEvolutionId(evolutionMsgId) |
| handleEvolutionWebhook | handleMessagesUpdate | Switch case dispatch | WIRED | `case "MESSAGES_UPDATE":` at :398, calls handleMessagesUpdate at :401 |
| handleMessagesUpdate | GHL API | PUT /conversations/messages/{id}/status | WIRED | :466-468 makes PUT request with mapped status |
| mapEvolutionStatusToGhl | handleMessagesUpdate | Status transformation | WIRED | :457 calls mapEvolutionStatusToGhl(data.status), used at :468 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| STATUS-07: Store mapping after Evolution send | SATISFIED | None |
| STATUS-08: MESSAGES_UPDATE in allowed events | SATISFIED | None |
| STATUS-09: handleMessagesUpdate method | SATISFIED | None |
| STATUS-10: mapEvolutionStatusToGhl helper | SATISFIED | None |
| STATUS-11: PUT /messages/{id}/status endpoint | SATISFIED | None |
| STATUS-12: Only "sent" immediately | SATISFIED | None |
| STATUS-13: No setTimeout fake delivery | SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | - |

**Anti-pattern scan results:**
- TODO/FIXME/PLACEHOLDER: 0 matches in ghl.service.ts
- setTimeout: 0 matches (no fake delay patterns)
- Hardcoded "delivered": Only in mapEvolutionStatusToGhl (:490) and comment (:722) - legitimate uses

**Return null analysis (not stubs):**
- Line 81: parseInstanceState returns null for undefined state - legitimate null handling
- Line 93: parseInstanceState returns null for unknown states - legitimate fallback
- Line 335/359: Contact lookup returns null when not found - legitimate optional
- Line 500: mapEvolutionStatusToGhl returns null for unknown status - legitimate filter (prevents sending unknown status to GHL)

### Human Verification Required

None required. All observable truths can be verified programmatically via code structure analysis.

**Optional manual testing (if time permits):**

1. **End-to-end delivery receipt flow**
   - Test: Send message from GHL, wait for WhatsApp delivery, check GHL shows "delivered"
   - Expected: GHL message status changes from "sent" -> "delivered"
   - Why optional: Code structure verification confirms wiring is complete

2. **Read receipt flow**
   - Test: Have recipient read the message, check GHL shows "read"
   - Expected: GHL message status changes to "read"
   - Why optional: Same wiring as delivery, just different status mapping

### Verification Evidence Summary

**Truth 1: Message mapping storage**
```typescript
// ghl.service.ts:735-748
if (evolutionMsgId && webhookData.messageId && evolutionMsgId !== "sent") {
  try {
    await this.prisma.createSentMessage({
      ghlMessageId: webhookData.messageId,
      evolutionMsgId: evolutionMsgId,
      instanceId: instance.id,
      contactPhone: phone,
    });
```
- Guard condition prevents storing placeholder "sent" IDs
- Best-effort (catch block logs but doesn't throw)

**Truth 2: MESSAGES_UPDATE handling**
```typescript
// ghl.service.ts:398-405
case "MESSAGES_UPDATE":
  if (isMessagesUpdateData(webhook.data)) {
    await this.handleMessagesUpdate(instance, webhook.data);
  }
  break;
```
- Type guard ensures correct data shape
- Handler called with instance context for user token access

**Truth 3: Real status from webhook**
```typescript
// ghl.service.ts:457-468
const ghlStatus = this.mapEvolutionStatusToGhl(data.status);
if (!ghlStatus) {
  this.logger.debug(`Ignoring status ${data.status} - not relevant for GHL`);
  return;
}
const response = await client.put(
  `/conversations/messages/${sentMessage.ghlMessageId}/status`,
  { status: ghlStatus },
);
```
- Status derived from Evolution webhook, not hardcoded
- Unknown statuses filtered (returns early)

**Truth 4: No fake delivery**
- grep for `setTimeout`: 0 matches
- grep for `"delivered"` in ghl.service.ts: Only 2 occurrences
  - Line 490: In mapEvolutionStatusToGhl (legitimate - maps from webhook)
  - Line 722: In comment explaining real status flow (documentation only)
- Immediate status is "sent" only (line 727)

**Truth 5: Failed status support**
```typescript
// ghl.service.ts:496-498
case "ERROR":
case "FAILED":
  return "failed";
```
- Both ERROR and FAILED Evolution statuses map to "failed" in GHL

### Database Schema Verification

**SentMessage model (prisma/schema.prisma:49-60):**
- `ghlMessageId`: String with @unique - prevents duplicate mappings
- `evolutionMsgId`: String indexed for fast lookup
- `instanceId`: BigInt with CASCADE delete - cleanup on instance removal
- `contactPhone`: Optional for debugging

**Migration (20260113000000_add_sent_messages):**
- Table creation with proper indexes
- Foreign key to Instance with CASCADE delete
- Ready for deployment via `prisma migrate deploy`

---

*Verified: 2025-01-18*
*Verifier: Claude (gsd-verifier)*
*Phase 3 status: Complete*
