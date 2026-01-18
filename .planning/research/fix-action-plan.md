# Fix Action Plan: evo-api-ghl WhatsApp Adapter

## Executive Summary

**Target Codebase:** `/Users/malone/Projects/evo-api-ghl/`

**Business Impact:** Healthcare practices losing patient messages due to two critical bugs:
1. **@lid identifiers** - Android users (~30-40%) messages silently disappear
2. **Read receipts** - GHL never learns when messages are delivered/read

**Estimated Total Effort:** 8-12 hours

**Dependencies:** None - all fixes are in the adapter layer, not Evolution API

---

## Fix 1: Add @lid Identifier Handling (CRITICAL)

### Problem
Android WhatsApp users have identifiers like `267215769174167@lid` instead of `31687483489@s.whatsapp.net`. The adapter's regex only handles `@c.us` and `@g.us`, causing:
- Invalid phone numbers sent to GHL API (e.g., `+267215769174167@lid`)
- Contact lookup failures
- Silent message loss

### Files to Modify

**File 1:** `src/ghl/ghl.service.ts`

**Line 444** - Replace regex that misses @lid:
```typescript
// CURRENT (broken):
const contactIdentifier = webhook.senderData.chatId.replace(/@[cg]\.us$/, "");

// FIXED:
const contactIdentifier = webhook.senderData.chatId.split("@")[0];
```

**Line 138** (in `getGhlContact`) - Add @lid stripping:
```typescript
// CURRENT (broken):
const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

// FIXED:
const cleanPhone = phone.split("@")[0]; // Strip @lid, @c.us, @g.us
const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
```

**Line 167** (in `findOrCreateGhlContact`) - Same fix:
```typescript
// CURRENT (broken):
const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

// FIXED:
const cleanPhone = phone.split("@")[0];
const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
```

**File 2:** `src/ghl/ghl.transformer.ts`

**Line 24-26** - Add @lid handling for incoming messages:
```typescript
// CURRENT:
const isGroup = webhook.senderData?.chatId?.endsWith("@g.us") || false;
const senderName = webhook.senderData.senderName || webhook.senderData.senderContactName || "Unknown";
const senderNumber = webhook.senderData.sender;

// ENHANCED (add after line 26):
const isLid = webhook.senderData?.chatId?.endsWith("@lid") || false;
if (isLid) {
  this.logger.warn(`@lid identifier detected: ${webhook.senderData.chatId}`, {
    chatId: webhook.senderData.chatId,
    sender: webhook.senderData.sender,
  });
}
```

### New Code to Add

**Create utility file:** `src/utils/jid.utils.ts`

```typescript
/**
 * WhatsApp JID (Jabber ID) utilities for handling @lid identifiers
 */

export function isLidIdentifier(jid: string): boolean {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

export function isGroupIdentifier(jid: string): boolean {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function isPhoneIdentifier(jid: string): boolean {
  return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'));
}

export function extractPhoneNumber(jid: string): string {
  if (!jid) return '';
  // Split on @ to handle all formats: @lid, @c.us, @g.us, @s.whatsapp.net
  return jid.split('@')[0];
}

export function formatPhoneForGhl(phone: string): string {
  const clean = extractPhoneNumber(phone);
  return clean.startsWith('+') ? clean : `+${clean}`;
}
```

### Estimated Effort
2-3 hours

### Dependencies
None - standalone fix

### Testing
1. Send message FROM an Android user (ask patient to message practice)
2. Verify message appears in GHL with correct contact
3. Check logs for `@lid identifier detected` warning
4. Verify no `+...@lid` invalid phone numbers in GHL contacts

---

## Fix 2: Add Message Mapping Database Table (CRITICAL)

### Problem
When GHL sends a message, Evolution API returns an `idMessage`. This ID is never stored. When status webhooks arrive later, we can't correlate them back to the GHL message to update its status.

### Files to Modify

**File:** `prisma/schema.prisma`

### New Code to Add

Add after the `Instance` model (line 45):

```prisma
model MessageMapping {
  id                 String    @id @default(cuid())
  ghlMessageId       String    @db.VarChar(100)
  ghlLocationId      String    @db.VarChar(100)
  evolutionMessageId String    @unique @db.VarChar(100)
  instanceId         BigInt
  instance           Instance  @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  // Status tracking
  status             String    @default("pending") @db.VarChar(30)
  sentAt             DateTime  @default(now())
  deliveredAt        DateTime?
  readAt             DateTime?
  failedAt           DateTime?
  errorMessage       String?   @db.Text

  // For @lid tracking
  recipientJid       String?   @db.VarChar(100)
  isLidRecipient     Boolean   @default(false)

  @@index([ghlMessageId, ghlLocationId])
  @@index([evolutionMessageId])
  @@index([instanceId])
}
```

Also update the `Instance` model to add the relation:

```prisma
model Instance {
  id               BigInt           @id @default(autoincrement())
  idInstance       BigInt           @unique
  apiTokenInstance String
  stateInstance    InstanceState?
  userId           String
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings         Json?            @default("{}") @db.Json
  name             String?
  createdAt        DateTime         @default(now())
  messageMappings  MessageMapping[] // ADD THIS LINE

  @@index([userId])
}
```

### Migration Commands

```bash
cd /Users/malone/Projects/evo-api-ghl

# Generate migration
npx prisma migrate dev --name add_message_mapping

# Or for production
npx prisma migrate deploy
```

### Estimated Effort
1 hour

### Dependencies
None - database change only

---

## Fix 3: Store Message Mapping on Send (CRITICAL)

### Problem
After sending a message to Evolution API, the returned `idMessage` is not stored anywhere.

### Files to Modify

**File:** `src/ghl/ghl.service.ts`

**Lines 405-417** (in `handlePlatformWebhook`) - Store mapping after send:

```typescript
// CURRENT:
switch (transformedMessage.type) {
  case "text":
    gaResponse = await greenApiClient.sendMessage(transformedMessage);
    break;
  case "url-file":
    gaResponse = await greenApiClient.sendFileByUrl(transformedMessage);
    break;
  default:
    this.gaLogger.error(`Unsupported Green API message type from GHL transform: ${transformedMessage.type}`);
    throw new IntegrationError(`Invalid Green API message type: ${transformedMessage.type}`, "INVALID_MESSAGE_TYPE", 500);
}
await this.updateGhlMessageStatus(locationId, messageId, "delivered");
return gaResponse;

// FIXED:
switch (transformedMessage.type) {
  case "text":
    gaResponse = await greenApiClient.sendMessage(transformedMessage);
    break;
  case "url-file":
    gaResponse = await greenApiClient.sendFileByUrl(transformedMessage);
    break;
  default:
    this.gaLogger.error(`Unsupported Green API message type from GHL transform: ${transformedMessage.type}`);
    throw new IntegrationError(`Invalid Green API message type: ${transformedMessage.type}`, "INVALID_MESSAGE_TYPE", 500);
}

// Store message mapping for status correlation
const evolutionMessageId = gaResponse?.idMessage || gaResponse?.key?.id;
if (evolutionMessageId && messageId) {
  try {
    await this.prisma.createMessageMapping({
      ghlMessageId: messageId,
      ghlLocationId: locationId,
      evolutionMessageId: evolutionMessageId,
      instanceId: BigInt(idInstance),
      recipientJid: transformedMessage.chatId,
      isLidRecipient: transformedMessage.chatId?.endsWith('@lid') || false,
      status: 'sent',
    });
    this.gaLogger.info(`Stored message mapping: GHL ${messageId} → Evolution ${evolutionMessageId}`);
  } catch (mappingError) {
    this.gaLogger.warn(`Failed to store message mapping (non-fatal): ${mappingError.message}`);
  }
}

// Don't hard-code "delivered" - let actual status webhook update it
// await this.updateGhlMessageStatus(locationId, messageId, "delivered"); // REMOVE THIS
return gaResponse;
```

**File:** `src/prisma/prisma.service.ts`

Add new method for message mapping:

```typescript
async createMessageMapping(data: {
  ghlMessageId: string;
  ghlLocationId: string;
  evolutionMessageId: string;
  instanceId: bigint;
  recipientJid?: string;
  isLidRecipient?: boolean;
  status?: string;
}): Promise<any> {
  return this.prismaClient.messageMapping.create({
    data: {
      ghlMessageId: data.ghlMessageId,
      ghlLocationId: data.ghlLocationId,
      evolutionMessageId: data.evolutionMessageId,
      instanceId: data.instanceId,
      recipientJid: data.recipientJid,
      isLidRecipient: data.isLidRecipient || false,
      status: data.status || 'pending',
    },
  });
}

async findMessageMappingByEvolutionId(evolutionMessageId: string): Promise<any> {
  return this.prismaClient.messageMapping.findUnique({
    where: { evolutionMessageId },
  });
}

async updateMessageMappingStatus(
  evolutionMessageId: string,
  status: string,
  timestamp?: Date,
): Promise<any> {
  const updateData: any = { status };

  if (status === 'delivered' && timestamp) {
    updateData.deliveredAt = timestamp;
  } else if (status === 'read' && timestamp) {
    updateData.readAt = timestamp;
  } else if (status === 'failed' && timestamp) {
    updateData.failedAt = timestamp;
  }

  return this.prismaClient.messageMapping.update({
    where: { evolutionMessageId },
    data: updateData,
  });
}
```

### Estimated Effort
2 hours

### Dependencies
Fix 2 (Message Mapping table) must be completed first

---

## Fix 4: Enable Status Webhooks (CRITICAL)

### Problem
Status webhooks from Evolution API are filtered out at the entry point.

### Files to Modify

**File:** `src/webhooks/webhooks.controller.ts`

**Line 33** - Add status webhook types:

```typescript
// CURRENT:
await this.ghlService.handleGreenApiWebhook(webhook, ["incomingMessageReceived", "stateInstanceChanged", "incomingCall"]);

// FIXED:
await this.ghlService.handleGreenApiWebhook(webhook, [
  "incomingMessageReceived",
  "stateInstanceChanged",
  "incomingCall",
  "outgoingMessageStatus",    // ADD: Status updates for sent messages
  "outgoingAPIMessageSent",   // ADD: Confirmation of API-sent messages
]);
```

### Estimated Effort
15 minutes

### Dependencies
Fix 3 must be completed first (need mapping to correlate status)

---

## Fix 5: Handle Status Webhooks (CRITICAL)

### Problem
No handler exists for status webhooks. Even if enabled, they would be logged as "unhandled".

### Files to Modify

**File:** `src/ghl/ghl.service.ts`

**Add after line 491** (in `handleGreenApiWebhook`, after the `incomingCall` else-if block):

```typescript
} else if (webhook.typeWebhook === "outgoingMessageStatus") {
  // Handle message status updates (delivered, read, etc.)
  await this.handleOutgoingMessageStatus(webhook, instanceWithUser);
} else if (webhook.typeWebhook === "outgoingAPIMessageSent") {
  // Handle API message sent confirmation
  await this.handleOutgoingApiMessageSent(webhook, instanceWithUser);
} else {
```

**Add new methods to GhlService class:**

```typescript
/**
 * Handle outgoing message status updates from Evolution API
 * Maps Evolution status to GHL status and updates the message
 */
private async handleOutgoingMessageStatus(
  webhook: any,
  instance: Instance & { user: User },
): Promise<void> {
  const evolutionMessageId = webhook.idMessage;
  const evolutionStatus = webhook.status; // 'sent', 'delivered', 'read', 'played', 'failed'

  this.gaLogger.info(`Received message status update: ${evolutionMessageId} → ${evolutionStatus}`);

  if (!evolutionMessageId) {
    this.gaLogger.warn(`Status webhook missing idMessage`, webhook);
    return;
  }

  // Look up the GHL message mapping
  const mapping = await this.prisma.findMessageMappingByEvolutionId(evolutionMessageId);

  if (!mapping) {
    this.gaLogger.warn(`No mapping found for Evolution message ${evolutionMessageId}`);
    return;
  }

  // Map Evolution status to GHL status
  const ghlStatus = this.mapEvolutionToGhlStatus(evolutionStatus);

  // Update GHL message status
  try {
    await this.updateGhlMessageStatus(mapping.ghlLocationId, mapping.ghlMessageId, ghlStatus);
    this.gaLogger.info(`Updated GHL message ${mapping.ghlMessageId} to status: ${ghlStatus}`);

    // Update our local tracking
    await this.prisma.updateMessageMappingStatus(evolutionMessageId, ghlStatus, new Date());
  } catch (error) {
    this.gaLogger.error(`Failed to update GHL message status: ${error.message}`, {
      evolutionMessageId,
      ghlMessageId: mapping.ghlMessageId,
      ghlStatus,
    });
  }
}

/**
 * Handle confirmation that an API-sent message was processed
 */
private async handleOutgoingApiMessageSent(
  webhook: any,
  instance: Instance & { user: User },
): Promise<void> {
  const evolutionMessageId = webhook.idMessage;

  this.gaLogger.info(`Received API message sent confirmation: ${evolutionMessageId}`);

  if (!evolutionMessageId) {
    return;
  }

  const mapping = await this.prisma.findMessageMappingByEvolutionId(evolutionMessageId);

  if (mapping && mapping.status === 'pending') {
    await this.prisma.updateMessageMappingStatus(evolutionMessageId, 'sent', new Date());
    this.gaLogger.info(`Updated mapping status to 'sent' for ${evolutionMessageId}`);
  }
}

/**
 * Map Evolution API status to GHL status
 */
private mapEvolutionToGhlStatus(evolutionStatus: string): 'pending' | 'delivered' | 'read' | 'failed' {
  switch (evolutionStatus?.toLowerCase()) {
    case 'sent':
    case 'server_ack':
      return 'pending'; // Message sent but not yet delivered
    case 'delivered':
    case 'delivery_ack':
      return 'delivered';
    case 'read':
    case 'played':
    case 'viewed':
      return 'read';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      this.gaLogger.warn(`Unknown Evolution status: ${evolutionStatus}, defaulting to pending`);
      return 'pending';
  }
}
```

### Estimated Effort
2-3 hours

### Dependencies
- Fix 2 (Message Mapping table)
- Fix 3 (Store mapping on send)
- Fix 4 (Enable status webhooks)

---

## Fix 6: Remove Fake Status Updates (CLEANUP)

### Problem
The adapter currently sets fake "delivered" status immediately after sending, hiding real delivery failures.

### Files to Modify

**File:** `src/ghl/ghl.service.ts`

**Line 416** - Remove hard-coded delivered status:
```typescript
// REMOVE THIS LINE:
await this.updateGhlMessageStatus(locationId, messageId, "delivered");
```

**Lines 269-279** - Remove setTimeout fake delivery:
```typescript
// REMOVE THIS ENTIRE BLOCK:
setTimeout(async () => {
  try {
    await this.updateGhlMessageStatus(locationId, messageId, "delivered");
    this.gaLogger.info(`Updated GHL message status to delivered`, {messageId});
  } catch (statusError) {
    this.gaLogger.warn(`Failed to update GHL message status, but message was posted successfully`, {
      messageId,
      error: statusError.message,
    });
  }
}, 5000);
```

### Estimated Effort
30 minutes

### Dependencies
Fixes 4 and 5 must be completed first (need real status handling before removing fake)

---

## Database Schema Changes Summary

### New Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

generator json {
  provider = "prisma-json-types-generator"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id             String     @id
  companyId      String?
  accessToken    String     @db.Text
  refreshToken   String     @db.Text
  tokenExpiresAt DateTime?
  instances      Instance[]
  createdAt      DateTime   @default(now())
}

enum InstanceState {
  notAuthorized
  authorized
  yellowCard
  blocked
  starting
}

model Instance {
  id               BigInt           @id @default(autoincrement())
  idInstance       BigInt           @unique
  apiTokenInstance String
  stateInstance    InstanceState?
  userId           String
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings         Json?            @default("{}") @db.Json
  name             String?
  createdAt        DateTime         @default(now())
  messageMappings  MessageMapping[]

  @@index([userId])
}

model MessageMapping {
  id                 String    @id @default(cuid())
  ghlMessageId       String    @db.VarChar(100)
  ghlLocationId      String    @db.VarChar(100)
  evolutionMessageId String    @unique @db.VarChar(100)
  instanceId         BigInt
  instance           Instance  @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  status             String    @default("pending") @db.VarChar(30)
  sentAt             DateTime  @default(now())
  deliveredAt        DateTime?
  readAt             DateTime?
  failedAt           DateTime?
  errorMessage       String?   @db.Text

  recipientJid       String?   @db.VarChar(100)
  isLidRecipient     Boolean   @default(false)

  @@index([ghlMessageId, ghlLocationId])
  @@index([evolutionMessageId])
  @@index([instanceId])
}
```

### Migration Commands

```bash
cd /Users/malone/Projects/evo-api-ghl

# Development
npx prisma migrate dev --name add_message_mapping_table

# Production (after testing)
npx prisma migrate deploy

# Regenerate client
npx prisma generate
```

---

## Testing Plan

### Test 1: @lid Identifier Handling

**Setup:**
1. Have an Android user send a WhatsApp message to the connected number

**Verify:**
- [ ] Message appears in GHL conversation
- [ ] Contact created with valid phone number (not `+...@lid`)
- [ ] Log shows `@lid identifier detected` warning
- [ ] Reply from GHL reaches the Android user

**SQL Check:**
```sql
-- Should NOT find any @lid contacts
SELECT * FROM contacts WHERE phone LIKE '%@lid%';
```

### Test 2: Message Mapping Storage

**Setup:**
1. Send a message from GHL to a WhatsApp user

**Verify:**
- [ ] MessageMapping record created in database
- [ ] `evolutionMessageId` is populated
- [ ] `ghlMessageId` matches the GHL message

**SQL Check:**
```sql
SELECT * FROM MessageMapping ORDER BY sentAt DESC LIMIT 5;
```

### Test 3: Read Receipt Flow

**Setup:**
1. Send message from GHL
2. Have recipient open and read the message on WhatsApp

**Verify:**
- [ ] MessageMapping status changes: `pending` → `delivered` → `read`
- [ ] GHL message shows "read" status
- [ ] Timestamps populated: `sentAt`, `deliveredAt`, `readAt`

**API Check:**
```bash
# Check GHL message status
curl -H "Authorization: Bearer $GHL_TOKEN" \
  "https://services.leadconnectorhq.com/conversations/messages/$MESSAGE_ID"
```

### Test 4: Delivery Failure Handling

**Setup:**
1. Send message to invalid/blocked number
2. Wait for Evolution API failure webhook

**Verify:**
- [ ] MessageMapping status = `failed`
- [ ] GHL message shows "failed" status
- [ ] `failedAt` timestamp populated
- [ ] Error visible in GHL conversation

### Test 5: No More Fake Status

**Setup:**
1. Disconnect Evolution API instance (simulate failure)
2. Send message from GHL

**Verify:**
- [ ] Message does NOT show "delivered" after 5 seconds
- [ ] Message stays in "pending" or shows "failed"
- [ ] No false delivery confirmations

---

## Deployment Steps

### Phase 1: Database Migration (Low Risk)

```bash
# 1. Backup database
mysqldump -u user -p database > backup_$(date +%Y%m%d).sql

# 2. Run migration
cd /Users/malone/Projects/evo-api-ghl
npx prisma migrate deploy

# 3. Verify table created
mysql -u user -p database -e "DESCRIBE MessageMapping;"
```

### Phase 2: Deploy Code Changes (Medium Risk)

```bash
# 1. Deploy to staging first
git checkout -b fix/lid-and-status-handling
# ... make all code changes ...
git commit -m "Fix @lid handling and add real status tracking"
git push origin fix/lid-and-status-handling

# 2. Test on staging with real WhatsApp traffic

# 3. Deploy to production during low-traffic window
git checkout main
git merge fix/lid-and-status-handling
git push origin main
```

### Phase 3: Monitor (Critical)

```bash
# Watch logs for:
# - "@lid identifier detected" warnings
# - "Stored message mapping" successes
# - "Updated GHL message" status changes
# - Any "No mapping found" warnings

tail -f /var/log/evo-api-ghl/app.log | grep -E "@lid|mapping|status"
```

### Rollback Plan

```bash
# If issues detected:
# 1. Revert code
git revert HEAD
git push origin main

# 2. Database is additive (new table) - no rollback needed
# Old code will simply not use MessageMapping table
```

---

## Priority Order

| Priority | Fix | Effort | Impact | Dependencies |
|----------|-----|--------|--------|--------------|
| 1 | Fix 1: @lid Handling | 2-3h | **CRITICAL** - Stops message loss | None |
| 2 | Fix 2: MessageMapping Table | 1h | **CRITICAL** - Enables status tracking | None |
| 3 | Fix 3: Store Mapping on Send | 2h | **CRITICAL** - Populates mapping table | Fix 2 |
| 4 | Fix 4: Enable Status Webhooks | 15m | **CRITICAL** - Allows status through | Fix 3 |
| 5 | Fix 5: Handle Status Webhooks | 2-3h | **CRITICAL** - Processes status | Fix 2,3,4 |
| 6 | Fix 6: Remove Fake Status | 30m | Cleanup | Fix 4,5 |

**Total Estimated Effort:** 8-12 hours

---

## Success Metrics

After deployment, measure:

1. **@lid Messages Processed**: Count logs with `@lid identifier detected`
2. **Message Mappings Created**: `SELECT COUNT(*) FROM MessageMapping`
3. **Status Updates Received**: Count `Updated GHL message` log entries
4. **Read Receipts Delivered**: `SELECT COUNT(*) FROM MessageMapping WHERE readAt IS NOT NULL`
5. **Zero Fake Deliveries**: No messages with `deliveredAt` within 5s of `sentAt` without real webhook

---

## Files Changed Summary

| File | Lines Modified | Type |
|------|----------------|------|
| `prisma/schema.prisma` | +25 | Schema |
| `src/utils/jid.utils.ts` | +30 (new) | Utility |
| `src/ghl/ghl.service.ts` | ~80 | Service |
| `src/ghl/ghl.transformer.ts` | +10 | Transformer |
| `src/prisma/prisma.service.ts` | +50 | Service |
| `src/webhooks/webhooks.controller.ts` | +5 | Controller |
