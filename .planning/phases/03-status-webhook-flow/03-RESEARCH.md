# Phase 3: Status Webhook Flow - Research

**Researched:** 2025-01-18
**Domain:** WhatsApp message status tracking, Evolution API webhooks, GHL API integration
**Confidence:** HIGH

## Summary

Phase 3 implements real message delivery and read status tracking by:
1. Storing message ID mappings (GHL message ID <-> Evolution message ID) when sending outbound messages
2. Processing MESSAGES_UPDATE webhooks from Evolution API
3. Forwarding status updates (sent/delivered/read/failed) to GHL via their Conversations API

**Critical Finding:** Most of the Phase 3 implementation is already complete in the codebase. The research confirms the existing implementation is correct and identifies what remains to verify or clean up.

**Primary recommendation:** Verify the existing implementation against all success criteria and ensure no deprecated/fake status code remains.

## Current Implementation State

### Already Implemented (Verified in Codebase)

| Requirement | Status | Location |
|------------|--------|----------|
| STATUS-07: Store mapping after send | **DONE** | `ghl.service.ts` lines 734-748 |
| STATUS-08: MESSAGES_UPDATE webhook type | **DONE** | `evolution-webhook.types.ts` line 238 |
| STATUS-09: handleOutgoingMessageStatus | **DONE** | `ghl.service.ts` lines 431-478 (as `handleMessagesUpdate`) |
| STATUS-10: mapEvolutionToGhlStatus | **DONE** | `ghl.service.ts` lines 483-501 (as `mapEvolutionStatusToGhl`) |
| STATUS-11: Update GHL via webhook | **DONE** | `ghl.service.ts` lines 464-477 |
| STATUS-12: Remove hardcoded "delivered" | **DONE** | Only "sent" is set immediately (line 727) |
| STATUS-13: Remove setTimeout fake | **DONE** | No setTimeout for status found in codebase |

### Database Schema (Phase 2 - Complete)

```prisma
model SentMessage {
  id              BigInt    @id @default(autoincrement())
  ghlMessageId    String    @unique          // GHL's message ID
  evolutionMsgId  String    @db.VarChar(100) // Evolution/WhatsApp message ID
  instanceId      BigInt
  instance        Instance  @relation(...)
  contactPhone    String?   @db.VarChar(50)  // For debugging
  createdAt       DateTime  @default(now())

  @@index([evolutionMsgId])
  @@index([instanceId])
}
```

Migration exists: `20260113000000_add_sent_messages`

## Evolution API Status Values

Evolution API sends MESSAGES_UPDATE webhooks with these status values:

| Evolution Status | Meaning | GHL Status | Implemented |
|-----------------|---------|------------|-------------|
| PENDING | Message queued | pending | Yes |
| SERVER_ACK | Server received | sent | Yes |
| DELIVERY_ACK | Delivered to device | delivered | Yes |
| READ | Recipient read | read | Yes |
| PLAYED | Audio/video played | read | Yes |
| ERROR | Send failed | failed | Yes |
| DELETED | Message deleted | (ignored) | Yes |

**Source:** Evolution API documentation, verified in `mapEvolutionStatusToGhl()`

### Evolution MESSAGES_UPDATE Webhook Format

```typescript
interface EvolutionMessagesUpdateData {
  keyId: string;           // Message ID (correlates with sent message)
  remoteJid: string;       // Recipient JID
  fromMe: boolean;         // true for outbound status updates
  participant?: string;    // For group messages
  status: string;          // PENDING, SERVER_ACK, DELIVERY_ACK, READ, PLAYED, ERROR
  instanceId?: string;
  messageId?: string;      // Alternative field name
}
```

## GHL API Status Update

### Endpoint

```
PUT /conversations/messages/{messageId}/status
```

**Request Body:**
```json
{
  "status": "sent" | "delivered" | "read" | "failed" | "pending"
}
```

### Important Restrictions

1. **Authentication:** Requires OAuth token with `conversations/messages.readonly` and `conversations/messages.write` scopes
2. **Provider Token:** Status updates can only be made by the conversation provider's marketplace application token
3. **Rate Limits:** 100 requests per 10 seconds per location

**Source:** [GHL API Documentation](https://marketplace.gohighlevel.com/docs/ghl/conversations/update-message-status/index.html)

## Data Flow (Implemented)

### Outbound Message with Status Tracking

```
GHL Webhook (OutboundMessage)
    |
    v
webhooks.controller.ts:handleGhlWebhook()
    |
    v
ghl.service.ts:handleGhlOutboundMessage()
    |
    +---> Send to Evolution API
    |     Returns: { key: { id: "ABC123" } }
    |
    +---> Mark as "sent" in GHL immediately
    |
    +---> Store SentMessage mapping:
          { ghlMessageId, evolutionMsgId, instanceId }
```

### Status Webhook Flow

```
Evolution MESSAGES_UPDATE Webhook
    |
    v
webhooks.controller.ts:handleEvolutionWebhook()
    |
    v
ghl.service.ts:handleEvolutionWebhook()
    |
    v
handleMessagesUpdate()
    |
    +---> Filter: only fromMe=true (outbound)
    |
    +---> Lookup: findSentMessageByEvolutionId()
    |
    +---> Map: mapEvolutionStatusToGhl()
    |
    +---> Update GHL: PUT /messages/{id}/status
```

## Edge Cases and Error Handling

### Handled in Current Implementation

| Edge Case | Handling | Location |
|-----------|----------|----------|
| No message ID in webhook | Logs warning, returns | Line 442-445 |
| Incoming message status (fromMe=false) | Silently ignored | Line 436-439 |
| No mapping found | Debug log, returns | Line 451-454 |
| Unknown status value | Returns null, ignored | Line 500 |
| GHL API error | Logs error, continues | Line 471-476 |
| Evolution returns "sent" as idMessage | Skips mapping storage | Line 735 condition |

### Not Stored Locally

Per project decision, status is forwarded directly to GHL and NOT stored locally in the SentMessage table. This is intentional - GHL is the source of truth for message status.

## Testing Considerations

### What Needs Verification

1. **End-to-end flow:** Send message from GHL, verify Evolution receives it, verify status webhooks update GHL
2. **Status mapping:** Verify all Evolution status values correctly map to GHL statuses
3. **Edge cases:** Messages without mapping (workflow messages, pre-migration messages)
4. **Error handling:** GHL API failures should not crash the webhook handler

### Test Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Send text message | Maps GHL ID to Evolution ID, marks as "sent" |
| Message delivered | DELIVERY_ACK webhook updates GHL to "delivered" |
| Message read | READ webhook updates GHL to "read" |
| Message failed | ERROR webhook updates GHL to "failed" |
| Workflow message (no GHL ID) | Skips mapping, no error |
| Pre-migration message | "No mapping found" debug log, continues |

## Common Pitfalls

### Pitfall 1: Message ID Extraction

**What goes wrong:** Evolution API returns message ID in different formats
**Current handling:** Checks both `data.keyId` and `data.messageId`
**Verification needed:** Confirm all Evolution versions use consistent field names

### Pitfall 2: Race Conditions

**What goes wrong:** Status webhook arrives before mapping is stored
**Current handling:** Debug log "No mapping found" - silent failure
**Impact:** Rare - Evolution typically sends status updates seconds after send

### Pitfall 3: Duplicate Status Updates

**What goes wrong:** Evolution may send same status multiple times
**Current handling:** Idempotent - GHL just gets updated to same status
**No issue:** PUT is idempotent

### Pitfall 4: GHL Token Expiry

**What goes wrong:** OAuth token expires during status update
**Current handling:** `getValidGhlClient()` refreshes expired tokens
**Verification needed:** Ensure refresh works correctly for status update calls

## Cleanup Verification Checklist

Since most implementation exists, verify these items are correctly implemented:

- [x] `MESSAGES_UPDATE` in `ALLOWED_EVOLUTION_EVENTS` array
- [x] No hardcoded "delivered" status (only "sent" is set immediately)
- [x] No `setTimeout` for fake delivery status
- [x] Message mapping stored with Evolution ID index
- [x] Status webhook handler processes only `fromMe: true` messages
- [x] GHL status update uses correct endpoint path
- [x] Error handling doesn't throw (best-effort status updates)

## Code Examples

### Message Mapping Storage (Existing)

```typescript
// ghl.service.ts lines 734-748
if (evolutionMsgId && webhookData.messageId && evolutionMsgId !== "sent") {
  try {
    await this.prisma.createSentMessage({
      ghlMessageId: webhookData.messageId,
      evolutionMsgId: evolutionMsgId,
      instanceId: instance.id,
      contactPhone: phone,
    });
    this.logger.debug(`Stored message mapping: GHL ${webhookData.messageId} -> Evolution ${evolutionMsgId}`);
  } catch (mapError) {
    this.logger.warn(`Failed to store message mapping: ${mapError.message}`);
  }
}
```

### Status Update Handler (Existing)

```typescript
// ghl.service.ts lines 431-478
private async handleMessagesUpdate(
  instance: Instance & { user: User },
  data: EvolutionMessagesUpdateData,
): Promise<void> {
  if (!data.fromMe) {
    this.logger.debug(`Ignoring status update for incoming message`);
    return;
  }

  const evolutionMsgId = data.keyId || data.messageId;
  const sentMessage = await this.prisma.findSentMessageByEvolutionId(evolutionMsgId);
  if (!sentMessage) {
    this.logger.debug(`No mapping found for Evolution message ${evolutionMsgId}`);
    return;
  }

  const ghlStatus = this.mapEvolutionStatusToGhl(data.status);
  if (!ghlStatus) return;

  const { client } = await this.getValidGhlClient(sentMessage.instance.user);
  await client.put(
    `/conversations/messages/${sentMessage.ghlMessageId}/status`,
    { status: ghlStatus },
  );
}
```

## Open Questions

1. **Database migration deployed?**
   - Migration exists but needs `prisma migrate deploy` on production
   - Verification: Check if SentMessage table exists in production DB

2. **Evolution API version compatibility?**
   - Current types assume Evolution API v2 format
   - Verify: Confirm production Evolution instance uses compatible version

3. **Message cleanup strategy?**
   - `cleanupOldSentMessages()` method exists but not scheduled
   - Recommendation: Add cleanup job or leave for Phase 4 (post-v1)

## Sources

### Primary (HIGH confidence)

- **Source code analysis:** `/Users/malone/evo-api-ghl/src/ghl/ghl.service.ts`
  - Lines 431-501: Status handling implementation
  - Lines 720-753: Outbound message with mapping storage
- **Source code analysis:** `/Users/malone/evo-api-ghl/src/ghl/types/evolution-webhook.types.ts`
  - Complete type definitions for MESSAGES_UPDATE
- **Source code analysis:** `/Users/malone/evo-api-ghl/prisma/schema.prisma`
  - SentMessage model schema

### Secondary (MEDIUM confidence)

- [GHL Update Message Status API](https://marketplace.gohighlevel.com/docs/ghl/conversations/update-message-status/index.html)
- [GHL Conversation Providers](https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/index.html)
- [Evolution API Webhooks Documentation](https://doc.evolution-api.com/v2/en/configuration/webhooks)

### Tertiary (Prior Research)

- `.planning/research/task2-status-flow-research.md` - Detailed analysis from prior session

## Metadata

**Confidence breakdown:**
- Implementation state: HIGH - verified by direct code inspection
- Evolution API format: HIGH - verified by types and prior research
- GHL API format: MEDIUM - based on official docs, not tested
- Edge cases: MEDIUM - theoretical analysis, needs runtime verification

**Research date:** 2025-01-18
**Valid until:** Stable - implementation is complete, just needs verification

## Summary for Planner

**Key Finding:** Phase 3 requirements are already implemented in the codebase. The planner should create a verification-focused plan rather than an implementation plan.

**Recommended Plan Structure:**
1. **03-01: Verification and Testing** - Verify implementation, run tests, check production readiness
2. No additional implementation plans needed

**What's Already Done:**
- STATUS-07: Message mapping stored after send
- STATUS-08: MESSAGES_UPDATE webhook type enabled
- STATUS-09: `handleMessagesUpdate` method exists
- STATUS-10: `mapEvolutionStatusToGhl` helper exists
- STATUS-11: GHL status update via PUT endpoint
- STATUS-12: No hardcoded "delivered" (only "sent")
- STATUS-13: No setTimeout fake delivery

**What Needs Verification:**
- Database migration deployed to production
- End-to-end flow works correctly
- All status values map correctly
- Error handling is graceful
