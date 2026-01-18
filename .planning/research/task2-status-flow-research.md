# Task 2: Message Status Flow Research

## Executive Summary

| Component | Status Tracking | Read Receipts | Risk Level |
|-----------|-----------------|---------------|------------|
| **Evolution API** | Real webhooks with DB storage | Yes (timestamp-based) | **MEDIUM** - @lid correlation bug |
| **Our Adapter (evo-api-ghl)** | Missing webhook handler | Never reaches GHL | **CRITICAL** - No mapping table |
| **GREEN-API Adapter** | FAKE (5s setTimeout) | None | **CRITICAL** - Completely fake |

**Root Cause of "No mapping found" errors**: Our adapter doesn't have a message mapping table and filters out status webhooks at the entry point.

---

## The Core Problem

When we send a message:
```
GHL → Our Adapter → Evolution API → WhatsApp → User
```

When status updates come back:
```
WhatsApp → Evolution API → MESSAGES_UPDATE webhook → Our Adapter → ??? → GHL
                                                           ↑
                                              STATUS LOST HERE
```

---

## 1. Evolution API Status Flow

### Status Mapping
**File:** `evolution-api/src/utils/renderStatus.ts` (lines 1-11)

```typescript
export const status: Record<number, wa.StatusMessage> = {
  0: 'ERROR',
  1: 'PENDING',
  2: 'SERVER_ACK',    // Sent to WhatsApp servers
  3: 'DELIVERY_ACK',  // Delivered to recipient
  4: 'READ',          // Read by recipient
  5: 'PLAYED',        // Played (for voice/video)
};
```

### Outbound Message Flow
**File:** `evolution-api/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`

1. **Send Message** (lines 2289-2459)
   ```typescript
   // client.sendMessage() returns WAMessage with {key: {id, remoteJid, fromMe}}
   const messageSent = await client.sendMessage(chatId, message);
   ```

2. **Prepare Message** (lines 4652-4703)
   ```typescript
   // Outbound messages default to DELIVERY_ACK
   if (message.key.fromMe) {
     messageRaw.status = status[3]; // 'DELIVERY_ACK'
   }
   ```

3. **Save to Database** (line 2459)
   ```typescript
   await this.prismaRepository.message.create({ data: messageRaw });
   ```

4. **Emit Webhook** (line 2702)
   ```typescript
   this.sendDataWebhook(Events.MESSAGES_UPDATE, message);
   ```

### Incoming Status Updates (The Critical Path)
**File:** `whatsapp.baileys.service.ts` (lines 1558-1730)

```typescript
// Baileys emits 'messages.update' with status changes
if (events['messages.update']) {
  for (const { key, update } of events['messages.update']) {

    // 1. Build message object with status
    const message = {
      keyId: key.id,
      remoteJid: key?.remoteJid,
      fromMe: key.fromMe,
      status: status[update.status] ?? 'SERVER_ACK',
    };

    // 2. CRITICAL: Correlation by message ID
    const messages = await this.prismaRepository.$queryRaw`
      SELECT * FROM "Message"
      WHERE "instanceId" = ${this.instanceId}
      AND "key"->>'id' = ${key.id}
      LIMIT 1
    `;
    findMessage = messages[0] || null;

    // 3. IF NOT FOUND - STATUS SILENTLY DISCARDED
    if (!findMessage?.id) {
      this.logger.warn(`Original message not found for update. Skipping.`);
      continue;  // ← STATUS UPDATE LOST
    }

    // 4. Update database
    await this.prismaRepository.message.update({
      where: { id: findMessage.id },
      data: { status: status[update.status] },
    });

    // 5. Emit webhook
    this.sendDataWebhook(Events.MESSAGES_UPDATE, message);
  }
}
```

### Read Receipt Handler (Timestamp-Based)
**File:** `whatsapp.baileys.service.ts` (lines 1927-1942, 4734-4757)

```typescript
// Handles 'message-receipt.update' events
if (events['message-receipt.update']) {
  for (const event of payload) {
    const { remoteJid, readTimestamp } = event;

    // Bulk update by timestamp - not individual message IDs
    await this.prismaRepository.$executeRaw`
      UPDATE "Message"
      SET "status" = 'READ'
      WHERE "instanceId" = ${this.instanceId}
      AND "key"->>'remoteJid' = ${remoteJid}
      AND "messageTimestamp" <= ${readTimestamp}
      AND "status" = 'DELIVERY_ACK'
    `;
  }
}
```

### Database Schema
**File:** `evolution-api/prisma/postgresql-schema.prisma`

```prisma
model Message {
  id                String          @id @default(cuid())
  key               Json            @db.JsonB    // {id, remoteJid, fromMe, participant}
  status            String?         @db.VarChar(30)
  messageTimestamp  Int             @db.Integer
  instanceId        String
  MessageUpdate     MessageUpdate[]
}

model MessageUpdate {
  id          String   @id @default(cuid())
  keyId       String   @db.VarChar(100)
  remoteJid   String   @db.VarChar(100)
  status      String   @db.VarChar(30)
  messageId   String   // FK to Message
  instanceId  String
}
```

### @lid Correlation Bug
**The Problem:**

1. Message stored with: `remoteJid: "31687483489@s.whatsapp.net"` (after @lid→phone conversion)
2. Status update arrives with: `remoteJid: "267215769174167@lid"` (unchanged)
3. Query: `WHERE "key"->>'remoteJid' = '267215769174167@lid'` → **NO MATCH**
4. Result: Status update silently skipped at line 1650

---

## 2. Our Adapter (evo-api-ghl)

### CRITICAL FINDING: No Message Mapping Table

**File:** `evo-api-ghl/prisma/schema.prisma`

```prisma
// ONLY THESE MODELS EXIST:
model User {
  id           String     @id @default(cuid())
  ghlUserId    String     @unique
  instances    Instance[]
}

model Instance {
  id               BigInt    @id @default(autoincrement())
  idInstance       BigInt    @unique
  apiTokenInstance String
  userId           String
}

// MISSING: MessageMapping table!
```

### Webhook Entry Point - Status Webhooks Filtered Out
**File:** `evo-api-ghl/src/webhooks/webhooks.controller.ts` (line 33)

```typescript
// ONLY these webhook types are processed:
await this.ghlService.handleGreenApiWebhook(webhook,
  ["incomingMessageReceived", "stateInstanceChanged", "incomingCall"]
);

// MISSING from allowedTypes:
// - "outgoingMessageStatus"    ← STATUS UPDATES
// - "outgoingMessageReceived"  ← SENT CONFIRMATIONS
// - "MESSAGES_UPDATE"          ← EVOLUTION API EVENTS
```

**Impact:** Status webhooks from Evolution API are silently ignored at the entry point.

### Outbound Message Flow
**File:** `evo-api-ghl/src/ghl/ghl.service.ts` (lines 383-418)

```typescript
// 1. GHL sends message
const ghlMessageId = ghlWebhook.messageId;

// 2. Transform and send to WhatsApp
const gaResponse = await greenApiClient.sendMessage(transformedMessage);
// gaResponse contains: { idMessage: "ABC123..." }  ← EVOLUTION MESSAGE ID

// 3. Hard-coded status update (NOT based on actual delivery)
await this.updateGhlMessageStatus(locationId, ghlMessageId, "delivered");

// PROBLEM: gaResponse.idMessage is NOT STORED anywhere!
// Cannot correlate later when status webhooks arrive
```

### Status Update Method (Exists but Disconnected)
**File:** `evo-api-ghl/src/ghl/ghl.service.ts` (lines 202-241)

```typescript
public async updateGhlMessageStatus(
    ghlLocationId: string,
    ghlMessageId: string,        // Need this to update GHL
    status: "delivered" | "read" | "failed" | "pending",
): Promise<void> {
    await httpClient.put(`/conversations/messages/${ghlMessageId}/status`, {
        status: status
    });
}
```

**Problem:** When Evolution API sends a status webhook with `idMessage`, we can't look up the corresponding `ghlMessageId` because there's no mapping table.

### Why "No Mapping Found" Errors

If we added proper status webhook handling, it would fail like this:

```typescript
// HYPOTHETICAL CODE (doesn't exist yet):
if (webhook.event === "MESSAGES_UPDATE") {
    const evolutionMessageId = webhook.data.keyId;

    // Try to find GHL message ID - FAILS because no table
    const mapping = await db.messageMapping.findUnique({
        where: { evolutionMessageId }
    });

    if (!mapping) {
        console.error(`No mapping found for Evolution message ${evolutionMessageId}`);
        return; // Status update lost
    }

    await this.updateGhlMessageStatus(mapping.ghlLocationId, mapping.ghlMessageId, status);
}
```

### Data Flow Gap

```
OUTBOUND:
GHL (messageId: "ghl123") → Adapter → Evolution API (returns idMessage: "evo456")
                                ↓
                    idMessage "evo456" NOT STORED
                                ↓
                    Hard-coded "delivered" sent to GHL (fake)

INBOUND STATUS:
Evolution API webhook (idMessage: "evo456", status: "READ")
                                ↓
                    NOT in allowedTypes - FILTERED OUT
                                ↓
                    Even if reached handler, can't find "ghl123"
                                ↓
                    GHL never learns message was read
```

---

## 3. GREEN-API Adapter (Reference)

### FAKE Status Implementation
**File:** `greenapi-integration-gohighlevel/src/ghl/ghl.service.ts` (lines 269-279)

```typescript
// After posting message to GHL:
setTimeout(async () => {
    try {
        await this.updateGhlMessageStatus(locationId, messageId, "delivered");
        this.gaLogger.info(`Updated GHL message status to delivered`, {messageId});
    } catch (statusError) {
        // Silently suppress errors!
        this.gaLogger.warn(`Failed to update GHL message status...`);
    }
}, 5000);  // ← FAKE: 5 second delay, assumes delivery
```

### What They Got Wrong

1. **No Real Webhook Handling** - Same allowedTypes filter as our adapter
2. **Fake Delivery Confirmation** - 5s setTimeout, not actual WhatsApp confirmation
3. **No Read Receipts** - "read" status never used
4. **No Message Tracking** - No database table for messages
5. **Silent Failure** - Errors logged but not propagated

### What We Can Learn

**DON'T DO:**
- Hard-coded setTimeout for status
- Silently swallow status errors
- Ignore status webhooks entirely

**DO:**
- Track message IDs in a database
- Process actual status webhooks
- Report real delivery/read status to CRM

---

## 4. Comparison Table

| Feature | Evolution API | Our Adapter | GREEN-API Adapter |
|---------|---------------|-------------|-------------------|
| **Status Webhook Emission** | Yes (MESSAGES_UPDATE) | N/A (consumer) | N/A (consumer) |
| **Status Webhook Handling** | Internally processes | Filtered out | Filtered out |
| **Message ID Storage** | PostgreSQL (Message table) | **NONE** | **NONE** |
| **GHL↔WhatsApp Mapping** | N/A | **MISSING** | **MISSING** |
| **Read Receipt Tracking** | Yes (timestamp-based) | **NO** | **NO** (fake) |
| **Status Correlation** | By message key.id | **IMPOSSIBLE** | setTimeout fake |
| **Audit Trail** | MessageUpdate table | **NONE** | **NONE** |
| **@lid Handling in Status** | Buggy (correlation fails) | N/A | N/A |

---

## 5. Root Cause Analysis

### Why Messages Are "Lost"

```
┌─────────────────────────────────────────────────────────────────┐
│ FAILURE POINT 1: @lid in Evolution API                          │
│                                                                  │
│ Message stored:    remoteJid = "31687483489@s.whatsapp.net"     │
│ Status arrives:    remoteJid = "267215769174167@lid"            │
│ Database query:    WHERE key->>'remoteJid' = @lid → NO MATCH    │
│ Result:           Status update discarded silently               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ FAILURE POINT 2: Adapter Filtering                               │
│                                                                  │
│ Evolution sends:   MESSAGES_UPDATE webhook                       │
│ Adapter checks:    allowedTypes = [incomingMessageReceived,...]  │
│ MESSAGES_UPDATE:   NOT in list                                   │
│ Result:           Webhook ignored at entry point                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ FAILURE POINT 3: No Message Mapping                              │
│                                                                  │
│ GHL sends:         ghlMessageId = "ghl123"                       │
│ Evolution returns: idMessage = "evo456"                          │
│ Adapter stores:    NOTHING                                       │
│ Status arrives:    idMessage = "evo456"                          │
│ Lookup:           Cannot find ghlMessageId                       │
│ Result:           Cannot update GHL with real status             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Answers to Core Questions

### Q1: Where does Evolution API store outbound message IDs?
**Answer:** PostgreSQL `Message` table with the key stored as JSON:
```json
{
  "id": "3EB03E03EF123456789",
  "remoteJid": "31687483489@s.whatsapp.net",
  "fromMe": true
}
```
**File:** `evolution-api/prisma/postgresql-schema.prisma`

### Q2: How does Evolution API correlate incoming READ webhooks to those IDs?
**Answer:** Two methods:
1. **By message key.id** (lines 1643): Direct lookup in Message table
2. **By timestamp** (lines 4734-4757): Bulk update messages with timestamp <= readTimestamp

**Problem:** Both methods fail with @lid if the stored remoteJid doesn't match the incoming remoteJid.

### Q3: Where does our adapter store/lookup message mappings?
**Answer:** **NOWHERE** - There is no MessageMapping table in the Prisma schema. The `idMessage` returned by Evolution API is not stored.

### Q4: What's missing in the mapping flow?

1. **MessageMapping table** in database:
   ```prisma
   model MessageMapping {
     id                 String   @id @default(cuid())
     ghlMessageId       String
     evolutionMessageId String
     ghlLocationId      String
     instanceId         BigInt
     status             String   @default("pending")
     createdAt          DateTime @default(now())

     @@unique([evolutionMessageId])
     @@index([ghlMessageId])
   }
   ```

2. **Store mapping after send**:
   ```typescript
   const gaResponse = await greenApiClient.sendMessage(message);
   await db.messageMapping.create({
     data: {
       ghlMessageId: ghlWebhook.messageId,
       evolutionMessageId: gaResponse.idMessage,
       ghlLocationId: locationId,
       instanceId: instance.id
     }
   });
   ```

3. **Add status webhooks to allowedTypes**:
   ```typescript
   ["incomingMessageReceived", "stateInstanceChanged", "incomingCall",
    "MESSAGES_UPDATE", "outgoingMessageStatus"]
   ```

4. **Handle status webhooks**:
   ```typescript
   if (webhook.event === "MESSAGES_UPDATE") {
     const mapping = await db.messageMapping.findUnique({
       where: { evolutionMessageId: webhook.data.keyId }
     });
     if (mapping) {
       await this.updateGhlMessageStatus(
         mapping.ghlLocationId,
         mapping.ghlMessageId,
         webhook.data.status
       );
     }
   }
   ```

---

## 7. Recommended Fixes

### Priority 1: Add Message Mapping Table
```prisma
model MessageMapping {
  id                 String   @id @default(cuid())
  ghlMessageId       String
  evolutionMessageId String   @unique
  ghlLocationId      String
  instanceId         BigInt
  status             String   @default("pending")
  sentAt             DateTime @default(now())
  deliveredAt        DateTime?
  readAt             DateTime?
  failedAt           DateTime?
  errorMessage       String?

  @@index([ghlMessageId, ghlLocationId])
}
```

### Priority 2: Enable Status Webhooks
```typescript
// webhooks.controller.ts line 33
const allowedTypes = [
  "incomingMessageReceived",
  "stateInstanceChanged",
  "incomingCall",
  "MESSAGES_UPDATE",           // ADD THIS
  "outgoingMessageStatus",     // ADD THIS
];
```

### Priority 3: Store Message Mapping on Send
```typescript
// ghl.service.ts after sendMessage
const gaResponse = await greenApiClient.sendMessage(transformedMessage);

await this.prismaService.messageMapping.create({
  data: {
    ghlMessageId: ghlWebhook.messageId,
    evolutionMessageId: gaResponse.idMessage || gaResponse.key?.id,
    ghlLocationId: locationId,
    instanceId: instance.id,
    status: 'pending'
  }
});
```

### Priority 4: Handle Status Webhooks
```typescript
// Add to ghl.service.ts
async handleStatusWebhook(webhook: any): Promise<void> {
  if (webhook.event !== 'MESSAGES_UPDATE') return;

  const evolutionMessageId = webhook.data?.keyId || webhook.data?.key?.id;
  if (!evolutionMessageId) return;

  const mapping = await this.prismaService.messageMapping.findUnique({
    where: { evolutionMessageId }
  });

  if (!mapping) {
    this.logger.warn(`No mapping found for Evolution message ${evolutionMessageId}`);
    return;
  }

  const status = this.mapEvolutionStatus(webhook.data.status);
  await this.updateGhlMessageStatus(mapping.ghlLocationId, mapping.ghlMessageId, status);

  // Update local tracking
  await this.prismaService.messageMapping.update({
    where: { id: mapping.id },
    data: {
      status,
      ...(status === 'delivered' && { deliveredAt: new Date() }),
      ...(status === 'read' && { readAt: new Date() }),
    }
  });
}

private mapEvolutionStatus(evolutionStatus: string): 'delivered' | 'read' | 'failed' | 'pending' {
  switch (evolutionStatus) {
    case 'READ':
    case 'PLAYED':
      return 'read';
    case 'DELIVERY_ACK':
      return 'delivered';
    case 'ERROR':
      return 'failed';
    default:
      return 'pending';
  }
}
```

### Priority 5: Remove Hard-coded Status
```typescript
// Remove this line (currently line 416):
// await this.updateGhlMessageStatus(locationId, messageId, "delivered");

// Let the actual status webhook trigger the update
```

---

## 8. Key File References

### Evolution API
| File | Purpose | Key Lines |
|------|---------|-----------|
| `whatsapp.baileys.service.ts` | Status handling | 1558-1730 (messages.update), 4734-4757 (read receipts) |
| `renderStatus.ts` | Status enum | 1-11 |
| `postgresql-schema.prisma` | DB schema | Message, MessageUpdate models |

### Our Adapter (evo-api-ghl)
| File | Purpose | Key Lines |
|------|---------|-----------|
| `webhooks.controller.ts` | Entry point | 33 (allowedTypes filter) |
| `ghl.service.ts` | Message handling | 202-241 (updateStatus), 383-418 (send) |
| `schema.prisma` | DB schema | Missing MessageMapping |

### GREEN-API Adapter
| File | Purpose | Key Lines |
|------|---------|-----------|
| `ghl.service.ts` | Fake status | 269-279 (setTimeout) |
| `webhooks.controller.ts` | Entry point | 33 (same filter issue) |

---

## Next Steps

- [ ] Task 3: Compare architecture, tech stack, code quality
- [ ] Task 4: Final recommendation with implementation plan
