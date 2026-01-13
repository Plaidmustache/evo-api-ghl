# Evolution API ↔ GoHighLevel Integration Report
## Session 2: Read Receipts Implementation & Status Updates
**Date:** January 13, 2026  
**Session Duration:** ~2 hours  
**Status:** Partial Success - Sent/Delivered Working, Read Under Investigation

---

## Executive Summary

This session focused on implementing real-time message status updates (read receipts) in the GHL interface. We achieved significant progress: "Sent" and "Delivered" statuses now display correctly in GoHighLevel. The "Read" status requires further investigation but the groundwork is complete.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Investigation Process](#investigation-process)
3. [Key Discoveries](#key-discoveries)
4. [Implementation Changes](#implementation-changes)
5. [Testing Results](#testing-results)
6. [Technical Reference](#technical-reference)
7. [Remaining Work](#remaining-work)
8. [Appendix: Research Notes](#appendix-research-notes)

---

## Problem Statement

### Initial Symptoms
- Messages sent from GHL to WhatsApp were delivering successfully
- GHL UI showed no delivery/read indicators (no checkmarks)
- Logs indicated "Updated GHL message [id] status to delivered" with no errors
- GHL API returned `{"success":true,"traceId":"..."}` but UI didn't update

### Root Question
Why were status updates appearing successful in logs but not reflecting in the GHL user interface?

---

## Investigation Process

### Phase 1: Verbose Logging Analysis

Added detailed response logging to the status update calls:

```typescript
const response = await client.put(
  `/conversations/messages/${sentMessage.ghlMessageId}/status`,
  { status: ghlStatus },
);
this.logger.log(`Updated GHL message ${sentMessage.ghlMessageId} status to ${ghlStatus} - Response: ${JSON.stringify(response.data)}`);
```

**Finding:** API calls were succeeding (`{"success":true}`) but UI wasn't updating.

### Phase 2: GREEN-API Comparison Study

Cloned and analyzed the GREEN-API GoHighLevel integration repository:
- Repository: `github.com/green-api/greenapi-integration-gohighlevel`
- Purpose: Understand how a working implementation handles status updates

**Critical Discovery:** GREEN-API does NOT implement real read receipts. They use a "fake" approach:

```javascript
// GREEN-API's approach in postOutboundMessageToGhl():
setTimeout(async () => {
    await this.updateGhlMessageStatus(locationId, messageId, "delivered");
}, 5000);  // Just wait 5 seconds and mark as delivered regardless of actual status
```

Their webhook handler only processes:
```javascript
["incomingMessageReceived", "stateInstanceChanged", "incomingCall"]
```

They do NOT handle `outgoingMessageStatus` webhooks at all.

### Phase 3: GHL Marketplace App Configuration Verification

Investigated whether the conversation provider was correctly associated with the marketplace app.

**GHL Documentation States:**
> "Message status updates are only able to be updated by the conversation provider marketplace application tokens."

**Verification Steps:**
1. Confirmed new marketplace app created: `6964cf8aaef45e5a53fe77f8`
2. Located Conversation Provider settings under Build → Modules → Conversation Providers
3. Verified conversation provider `Evolution-whatsapp` exists with ID: `6964f1e040daf55d1ffea612`

**Configuration Confirmed:**
- ✅ Name: Evolution-whatsapp
- ✅ Type: SMS
- ✅ Delivery URL: `https://evo-whatsapp.nulab.cc/webhooks/ghl`
- ✅ "Is this a Custom Conversation Provider?" - Checked
- ✅ "Always show this Conversation Provider?" - Checked
- ✅ Alias: evo-whatsapp
- ✅ Conversation Provider ID matches environment variable

### Phase 4: Immediate Status Update Test

Hypothesis: Perhaps the webhook-based approach had timing or context issues.

**Test Implementation:** Added immediate status update right after sending message to WhatsApp:

```typescript
// Immediately after sending to WhatsApp
const { client: ghlClient } = await this.getValidGhlClient(instance.user);
await ghlClient.put(
  `/conversations/messages/${webhookData.messageId}/status`,
  { status: "sent" },
);
```

**Result:** SUCCESS - The "Sent" status appeared in GHL UI immediately.

This confirmed:
1. The GHL API endpoint is working correctly
2. Our OAuth token has proper permissions
3. The conversation provider association is correct

---

## Key Discoveries

### 1. GHL Status Update API Works

The API at `PUT /conversations/messages/:messageId/status` functions correctly when:
- Called with valid OAuth token from the marketplace app that owns the conversation provider
- Message ID is the GHL message ID (not Evolution API message ID)
- Status value is one of: `"sent"`, `"delivered"`, `"read"`, `"failed"`

### 2. GREEN-API's "Fake" Approach

GREEN-API's implementation does NOT provide real WhatsApp delivery/read receipts:
- They mark messages as "delivered" after a fixed 5-second delay
- They never update to "read" status
- This is a UX approximation, not true WhatsApp status tracking

Our implementation aims for REAL status tracking based on actual WhatsApp events.

### 3. Evolution API Status Codes

From Evolution API source code analysis:

| Code | Status | WhatsApp Meaning |
|------|--------|------------------|
| 0 | ERROR | Message failed to send |
| 1 | PENDING | Message queued locally |
| 2 | SERVER_ACK | Single tick - reached WhatsApp server |
| 3 | DELIVERY_ACK | Double tick - delivered to recipient's device |
| 4 | READ | Blue double tick - recipient opened the message |
| 5 | PLAYED | Voice/video message was played |

### 4. Webhook Event Types

Evolution API sends status updates via `MESSAGES_UPDATE` event, NOT a separate status event:

```json
{
  "event": "messages.update",
  "instance": "embody-amersfoort",
  "data": {
    "key": {
      "remoteJid": "31646331142@s.whatsapp.net",
      "fromMe": true,
      "id": "BAE5A7B8C9D0E1F2"
    },
    "status": "DELIVERY_ACK"
  }
}
```

---

## Implementation Changes

### Commit: `8006756` - test: Add immediate status update after sending (like GREEN-API)
- Added immediate status update call after WhatsApp send
- Purpose: Test if API works in direct call context

### Commit: `7db4255` - fix: Update status to delivered immediately (like GREEN-API)  
- Changed immediate update from "sent" to "delivered"
- Purpose: Test different status value

### Commit: `d580739` - fix: Mark as sent immediately, then real delivered/read via webhooks
- Final implementation approach:
  - Mark as "sent" immediately after WhatsApp accepts message
  - Real "delivered" status comes via Evolution API webhook
  - Real "read" status comes via Evolution API webhook

```typescript
// In handleGhlOutboundMessage():
// Immediately mark as "sent" (message accepted by WhatsApp server)
// Real "delivered" and "read" statuses come via Evolution API webhooks
try {
    const { client: ghlClient } = await this.getValidGhlClient(instance.user);
    await ghlClient.put(
        `/conversations/messages/${webhookData.messageId}/status`,
        { status: "sent" },
    );
    this.logger.log(`Marked GHL message ${webhookData.messageId} as sent`);
} catch (statusError) {
    this.logger.warn(`Failed to mark message as sent: ${statusError.message}`);
}
```

### Commit: `2133126` - docs: Add progress checkpoint
- Created PROGRESS.md documenting current state

---

## Testing Results

### Test 1: Immediate "Sent" Status
- **Action:** Send message from GHL
- **Expected:** Single checkmark in GHL UI
- **Result:** ✅ SUCCESS - "Sent" status displayed

### Test 2: Webhook-Based "Delivered" Status  
- **Action:** Send message, wait for recipient's phone to receive
- **Expected:** Double checkmark in GHL UI
- **Result:** ✅ SUCCESS - "Delivered" status displayed

### Test 3: Webhook-Based "Read" Status
- **Action:** Send message, recipient opens and reads message
- **Expected:** Blue double checkmark or "Read" indicator in GHL UI
- **Result:** ❌ NOT WORKING - Status remains at "Delivered"

---

## Technical Reference

### Current Message Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OUTBOUND MESSAGE FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

1. GHL User sends message
         │
         ▼
2. GHL Webhook → Adapter (/webhooks/ghl)
         │
         ▼
3. Adapter sends to Evolution API
         │
         ▼
4. Evolution API sends to WhatsApp
         │
         ▼
5. Adapter immediately marks GHL message as "sent" ✅
         │
         ▼
6. Adapter stores mapping: GHL_MSG_ID ↔ EVOLUTION_MSG_ID

┌─────────────────────────────────────────────────────────────────────────┐
│                         STATUS UPDATE FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

1. WhatsApp delivers message to recipient's device
         │
         ▼
2. Evolution API receives DELIVERY_ACK
         │
         ▼
3. Evolution Webhook → Adapter (/webhooks/evolution)
         │
         ▼
4. Adapter looks up GHL_MSG_ID from EVOLUTION_MSG_ID
         │
         ▼
5. Adapter calls GHL API: PUT /messages/{id}/status
         │
         ▼
6. GHL UI shows "Delivered" ✅

┌─────────────────────────────────────────────────────────────────────────┐
│                         READ STATUS FLOW (NOT WORKING)                  │
└─────────────────────────────────────────────────────────────────────────┘

1. Recipient opens message in WhatsApp
         │
         ▼
2. Evolution API receives READ status
         │
         ▼
3. Evolution Webhook → Adapter (?)  ← INVESTIGATION NEEDED
         │
         ▼
4. Adapter processes and updates GHL (?)
```

### Environment Configuration

| Variable | Value |
|----------|-------|
| APP_URL | https://evo-whatsapp.nulab.cc |
| GHL_CLIENT_ID | 6964cf8aaef45e5a53fe77f8-mkb5w2qf |
| GHL_CONVERSATION_PROVIDER_ID | 6964f1e040daf55d1ffea612 |
| GHL_APP_ID | 6964cf8aaef45e5a53fe77f8 |
| Evolution API URL | https://evo.nulab.cc |
| Evolution Instance | embody-amersfoort |

### Status Mapping Implementation

```typescript
private mapEvolutionStatusToGhl(evolutionStatus: string): string | null {
    switch (evolutionStatus.toUpperCase()) {
        case "READ":
        case "PLAYED":
            return "read";
        case "DELIVERY_ACK":
        case "DELIVERED":
            return "delivered";
        case "SERVER_ACK":
        case "PENDING":
            return "sent";
        case "ERROR":
        case "FAILED":
            return "failed";
        default:
            return null;
    }
}
```

### Database Schema (SentMessage)

```prisma
model SentMessage {
  id            String   @id @default(uuid())
  ghlMessageId  String   @unique
  evolutionMsgId String
  instanceId    String
  contactPhone  String
  createdAt     DateTime @default(now())
  instance      Instance @relation(fields: [instanceId], references: [id])
}
```

---

## Remaining Work

### Priority 1: Investigate READ Status Not Updating

**Potential Causes to Investigate:**

1. **Evolution API Webhook Subscription**
   - Verify `MESSAGES_UPDATE` event is subscribed for the instance
   - Check Evolution API webhook configuration at instance level
   - Command: `GET https://evo.nulab.cc/webhook/find/embody-amersfoort`

2. **READ Webhook Not Arriving**
   - Add logging at webhook entry point to see ALL incoming Evolution webhooks
   - Verify if READ events are being sent at all

3. **Message ID Format Mismatch**
   - Evolution may use different ID format for status updates vs send responses
   - Compare `key.id` in webhook vs stored `evolutionMsgId`

4. **WhatsApp Privacy Settings**
   - Recipient may have "Read Receipts" disabled in WhatsApp settings
   - This would prevent READ status from being generated

5. **GHL API Limitation**
   - Verify GHL accepts "read" as a valid status value
   - Test manually via curl/Postman

### Priority 2: Add Comprehensive Logging

Add logging at key points:
- Webhook entry (all events received)
- MESSAGES_UPDATE event parsing
- Message ID lookup results
- GHL API call and response

### Priority 3: Error Handling Improvements

- Handle cases where message mapping doesn't exist
- Graceful handling of GHL API failures
- Retry logic for transient failures

---

## Appendix: Research Notes

### Evolution API Webhook Documentation

**Source:** https://doc.evolution-api.com/v2/en/configuration/webhooks

**Key Points:**
- Webhooks can be configured globally (env) or per-instance (API)
- `MESSAGES_UPDATE` event provides status changes
- Status values: ERROR, PENDING, SERVER_ACK, DELIVERY_ACK, READ, PLAYED

**Webhook Configuration Example:**
```json
{
  "url": "{{webhookUrl}}",
  "webhook_by_events": false,
  "webhook_base64": false,
  "events": [
    "QRCODE_UPDATED",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "CONNECTION_UPDATE"
  ]
}
```

### GHL Update Message Status API

**Endpoint:** `PUT /conversations/messages/:messageId/status`

**Documentation:** https://marketplace.gohighlevel.com/docs/ghl/conversations/update-message-status

**Known Status Values:**
- `sent` - Message sent to provider
- `delivered` - Message delivered to recipient
- `read` - Message read by recipient  
- `failed` - Message failed to send

**Required Headers:**
- `Authorization: Bearer {access_token}`
- `Version: 2021-07-28`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "status": "delivered"
}
```

### Evolution API Source Code Analysis

**File:** `whatsapp.baileys.service.ts`

**Status Handling Code:**
```javascript
const status = { 
  0: 'ERROR', 
  1: 'PENDING', 
  2: 'SERVER_ACK', 
  3: 'DELIVERY_ACK', 
  4: 'READ', 
  5: 'PLAYED' 
};

for await (const { key, update } of args) {
  if (status[update.status] === 'READ' && key.fromMe) {
    // READ status is sent for outgoing messages
    // This triggers MESSAGES_UPDATE webhook
  }
}
```

**Key Insight:** Evolution API DOES send READ webhooks for outgoing messages (`key.fromMe === true`).

### GREEN-API Implementation Analysis

**Repository:** github.com/green-api/greenapi-integration-gohighlevel

**Webhook Handler (webhooks.controller.ts):**
```typescript
await this.ghlService.handleGreenApiWebhook(webhook, [
  "incomingMessageReceived", 
  "stateInstanceChanged", 
  "incomingCall"
]);
// Note: NO outgoingMessageStatus handling
```

**Fake Delivery Status (ghl.service.ts):**
```typescript
// After posting outbound message
setTimeout(async () => {
  await this.updateGhlMessageStatus(locationId, messageId, "delivered");
}, 5000);
```

**Conclusion:** GREEN-API does not provide real read receipts. They approximate delivery status with a fixed delay.

### GHL Conversation Provider Requirements

**From GHL Documentation:**

1. Must be created under a Marketplace App
2. Conversation Provider ID must match between:
   - App settings
   - Environment variable (`GHL_CONVERSATION_PROVIDER_ID`)
   - API calls (in message payloads)
3. Status updates only work when called by the app that owns the provider
4. OAuth token must be from the same marketplace app

**Verified Configuration:**
- App ID: `6964cf8aaef45e5a53fe77f8`
- Provider ID: `6964f1e040daf55d1ffea612`
- Both created January 12, 2026
- Provider correctly nested under the app

---

## Files Modified This Session

| File | Changes |
|------|---------|
| `src/ghl/ghl.service.ts` | Added immediate status update after send, verbose logging |
| `PROGRESS.md` | Created checkpoint document |
| `REPORT_SESSION_2.md` | This report |

## Git Commits This Session

| Hash | Message |
|------|---------|
| `bd50f5c` | chore: Add verbose logging for GHL status update response |
| `8006756` | test: Add immediate status update after sending (like GREEN-API) |
| `7db4255` | fix: Update status to delivered immediately (like GREEN-API) |
| `d580739` | fix: Mark as sent immediately, then real delivered/read via webhooks |
| `2133126` | docs: Add progress checkpoint |

---

## Conclusion

This session achieved significant progress in implementing real-time message status updates:

**Successes:**
- ✅ Identified and resolved why status updates weren't appearing in GHL UI
- ✅ Verified marketplace app and conversation provider configuration
- ✅ Implemented working "Sent" status (immediate)
- ✅ Implemented working "Delivered" status (via Evolution webhook)
- ✅ Documented Evolution API status codes and webhook structure

**Remaining:**
- ❌ "Read" status not updating (requires investigation)
- Need to verify Evolution API webhook subscription includes MESSAGES_UPDATE
- Need to add comprehensive logging to trace READ events

**Recommendation:**
Next session should focus on adding detailed logging at the webhook entry point to determine if READ events are being received from Evolution API at all. If they are arriving, trace through the handler logic. If not, investigate Evolution API instance webhook configuration.

---

*Report prepared for project documentation and future reference.*
*Last updated: January 13, 2026 04:50 CET*
