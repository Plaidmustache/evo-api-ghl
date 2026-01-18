# Task 1: @lid Identifier Handling Comparison

## Executive Summary

| API | @lid Handling | Risk Level | Verdict |
|-----|---------------|------------|---------|
| **Evolution API** | Partial - conditional fix exists | **HIGH** | Fix depends on `remoteJidAlt` being available |
| **WAHA** | Comprehensive - dedicated system | **LOW** | Best handling with persistent storage |
| **GREEN-API Adapter** | None | **CRITICAL** | Silent message loss guaranteed |

**Bottom Line:** WAHA has the most robust @lid handling. Evolution API has a patch but it's fragile. The GREEN-API adapter has no @lid handling at all.

---

## What is @lid?

WhatsApp identifies some users (mostly Android) with `@lid` format instead of phone numbers:
- **@lid format:** `267215769174167@lid`
- **Standard format:** `31687483489@s.whatsapp.net`

Messages from @lid users that aren't properly converted cause **silent message loss** - no errors, no alerts, just missing conversations.

---

## 1. Evolution API

### Location of @lid Handling
**Primary File:** `evolution-api/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`

### The Fix (Lines 1478-1479)
```typescript
// After preparing a message, if @lid present AND alternative exists, replace it
if (messageRaw.key.remoteJid?.includes('@lid') && messageRaw.key.remoteJidAlt) {
  messageRaw.key.remoteJid = messageRaw.key.remoteJidAlt;
}
```

### Contact Storage Logic (Lines 1512-1520)
```typescript
if (contactRaw.remoteJid.includes('@s.whatsapp') || contactRaw.remoteJid.includes('@lid')) {
  await saveOnWhatsappCache([
    {
      remoteJid: messageRaw.key.addressingMode === 'lid'
        ? messageRaw.key.remoteJidAlt   // Use phone number when @lid
        : messageRaw.key.remoteJid,
      remoteJidAlt: messageRaw.key.remoteJidAlt,
      lid: messageRaw.key.addressingMode === 'lid' ? 'lid' : null,
    },
  ]);
}
```

### JID Creation (utils/createJid.ts Lines 35-40)
```typescript
export function createJid(number: string): string {
  // ...cleanup...
  if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
    return number; // Returns @lid as-is without modification
  }
  // ...
}
```

### Cache Handling (utils/onWhatsappCache.ts Lines 17-19)
```typescript
function getAvailableNumbers(remoteJid: string) {
  const [number, domain] = remoteJid.split('@');

  // TODO: Se ja for @lid, retornar apenas ele mesmo SEM adicionar @domain novamente
  if (domain === 'lid' || domain === 'g.us') {
    return [remoteJid]; // Returns directly for @lid
  }
  // ...
}
```

### Chatwoot Integration (chatwoot.service.ts Lines 633-635)
```typescript
const isLid = body.key.addressingMode === 'lid';
const isGroup = body.key.remoteJid.endsWith('@g.us');
const phoneNumber = isLid && !isGroup ? body.key.remoteJidAlt : body.key.remoteJid;
```

### Vulnerabilities Identified

1. **Conditional Replacement** - The fix at line 1478 only works IF `remoteJidAlt` exists. If it's `undefined`, the @lid stays and downstream systems fail silently.

2. **Multiple Extraction Points** - Participant extraction happens in multiple places (lines 1220, 1250-1252, 1736) with inconsistent @lid handling.

3. **Database Storage Issue** - `remoteJid` can be stored as @lid, causing lookup failures when queried by phone number.

4. **Known Issues (TODOs)**:
   - Line 17: `// TODO: Se ja for @lid...`
   - Line 58: `// TODO: Adiciona @domain apenas...`
   - Line 105: `// TODO: Descobrir o motivo que causa o remoteJid nao estar (as vezes) incluso...`

### Verdict: PARTIAL HANDLING - HIGH RISK

Evolution API has @lid awareness but the implementation is fragile. The fix depends on `remoteJidAlt` always being present - when it's not, messages disappear.

---

## 2. WAHA

### Dedicated @lid API Controller
**File:** `waha/src/api/lids.controller.ts`

```typescript
@Controller('api/:session/lids')
export class LidsController {
  // GET /api/{session}/lids/ - Get all known lids to phone number mapping
  async getAll(): Promise<Array<LidToPhoneNumber>>

  // GET /api/{session}/lids/count - Get the number of known lids
  async getLidsCount(): Promise<CountResponse>

  // GET /api/{session}/lids/:lid - Get phone number by lid
  async findPNByLid(lid: string): Promise<LidToPhoneNumber>

  // GET /api/{session}/lids/pn/:phoneNumber - Get lid by phone number
  async findLIDByPhoneNumber(phoneNumber: string): Promise<LidToPhoneNumber>
}
```

### JID Classification (core/utils/jids.ts Lines 28-50)
```typescript
export function isLidUser(jid: string) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

export function isPnUser(jid: string) {
  if (typeof jid !== 'string') return false;
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@c.us')) return false;
  if (isNullJid(jid)) return false;
  return true;
}

export function toJID(chatId) {
  if (isLidUser(chatId)) return chatId;  // PRESERVES @lid format
  // ...only converts non-lid to @s.whatsapp.net
}
```

### Dual JID Extraction (core/utils/jids.ts Lines 118-144)
```typescript
export function jidsFromKey(key: WAMessageKey): Jids | null {
  // DM - Direct Messages
  if (isLidUser(key.remoteJid)) {
    return {
      lid: key.remoteJid,
      pn: key.remoteJidAlt,    // Alternative phone number format
    };
  } else if (isPnUser(key.remoteJid)) {
    return {
      lid: key.remoteJidAlt,   // Alternative LID format
      pn: key.remoteJid,
    };
  }

  // Groups - handles participants too
  // ...
  return null;
}
```

### Persistent Storage (store/NowebPersistentStore.ts Lines 104-142)
```typescript
ev.on('messages.upsert', (data) => {
  this.withNoLock('lids', async () => {
    const messages = data.messages;
    const contacts = messages.map((message) => {
      const jids = jidsFromKey(message.key);  // Extract both LID and PN
      if (!jids) return null;

      let { lid, pn } = jids;
      // Normalize and return both formats
      return { id: message.key.remoteJid, lid: lid, jid: pn };
    }).filter(Boolean);

    await this.handleLidPNUpdates(contacts);  // Save mapping
  });
});
```

### SQLite Repository (store/sqlite3/Sqlite3LidPNRepository.ts)
```typescript
export class Sqlite3LidPNRepository implements INowebLidPNRepository {
  saveLids(lids: LidToPN[]): Promise<void>
  getAllLids(pagination?: LimitOffsetParams): Promise<LidToPN[]>
  getLidsCount(): Promise<number>
  async findLidByPN(pn: string): Promise<string | null>
  async findPNByLid(lid: string): Promise<string | null>
}
```

### Group Message Bug Fix (session.noweb.core.ts Lines 636-639)
```typescript
// Fix fromMe in @lid addressed groups
// https://github.com/devlikeapro/waha/issues/1350
if (message.key.participant === this.getSessionMeInfo()?.lid) {
  message.key.fromMe = true;
}
```

### Message Deduplication (core/utils/reactive.ts Lines 14-49)
```typescript
/**
 * When a new contact sends their first message, WhatsApp may deliver:
 * 1. Two events with the same full ID but different internal structures
 * 2. Two events with different chat identifiers (LID vs JID) but same unique message ID
 */
export function DistinctMessages(flushEvery: number = 60_000) {
  return distinct((msg: WAMessage) => {
    const uniqueId = extractUniqueMessageId(msg.id);
    return `${msg.fromMe}_${uniqueId}`;  // Deduplicates regardless of @lid vs phone
  }, interval(flushEvery));
}
```

### Verdict: COMPREHENSIVE HANDLING - LOW RISK

WAHA has the most robust @lid handling:
- Dedicated REST API for LID lookups
- Persistent SQLite storage of LID-to-phone mappings
- Automatic mapping extraction from every message
- Message deduplication across JID formats
- Specific bug fixes for group @lid participants
- Comprehensive test coverage

---

## 3. GREEN-API Integration (GoHighLevel Adapter)

### Location of Identifier Processing
**File:** `greenapi-integration-gohighlevel/src/ghl/ghl.service.ts`

### The Problem (Lines 441-444)
```typescript
} else if (webhook.typeWebhook === "incomingMessageReceived") {
    const isGroup = webhook.senderData?.chatId?.endsWith("@g.us") || false;

    // THIS REGEX ONLY MATCHES @c.us AND @g.us - NOT @lid!
    const contactIdentifier = webhook.senderData.chatId.replace(/@[cg]\.us$/, "");
```

### Contact Lookup (Lines 133-154)
```typescript
public async getGhlContact(ghlUserId: string, phone: string): Promise<GhlContact | null> {
    // Simply prepends "+" - no @lid stripping!
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

    const {data} = await httpClient.post("/contacts/upsert", {
        locationId: ghlUserId,
        phone: formattedPhone,  // Could be "+267215769174167@lid" - INVALID!
    });
```

### Outgoing Messages (Lines 609-611)
```typescript
const chatId = formatPhoneNumber(contactPhone);
const cleanPhone = chatId.replace("@c.us", "");  // Only handles @c.us!
```

### Data Flow - Why Messages Are Lost

```
Green-API Webhook arrives with @lid identifier
    |
    v
ghl.service.ts:442 - Check if ends with @g.us? -> NO
    |
    v
ghl.service.ts:444 - Replace /@[cg]\.us$/ -> NO MATCH, STAYS AS "267215769174167@lid"
    |
    v
ghl.service.ts:458 - findOrCreateGhlContact(contactIdentifier: "267215769174167@lid")
    |
    v
ghl.service.ts:167 - formattedPhone = "+267215769174167@lid" (INVALID!)
    |
    v
GHL API receives "+267215769174167@lid" as phone number
    |
    v
GHL REJECTS or FAILS TO MATCH existing contact
    |
    v
MESSAGE SILENTLY LOST
```

### Verdict: NO HANDLING - CRITICAL RISK

The GREEN-API adapter was built assuming all WhatsApp IDs are `@c.us` or `@g.us` format. The @lid format causes:
- Regex mismatch (identifier not cleaned)
- Invalid phone numbers sent to GHL API
- Silent contact lookup failures
- Complete message loss with no errors

---

## Comparison Table

| Feature | Evolution API | WAHA | GREEN-API Adapter |
|---------|---------------|------|-------------------|
| Recognizes @lid format | Yes | Yes | No |
| Converts @lid to phone | Conditional | Yes | No |
| Persistent LID mapping | Partial (cache) | Yes (SQLite) | No |
| API for LID lookups | No | Yes | No |
| Group @lid handling | Partial | Yes (with bug fix) | No |
| Message deduplication | No | Yes | No |
| Error logging for @lid | No | No | No |
| Known TODO items | 3+ | 0 | 0 |

---

## Key Code References

### Evolution API
- Main @lid fix: `whatsapp.baileys.service.ts:1478-1479`
- Contact storage: `whatsapp.baileys.service.ts:1512-1520`
- JID creation: `utils/createJid.ts:35-40`
- Cache handling: `utils/onWhatsappCache.ts:17-19`
- Chatwoot integration: `chatwoot.service.ts:633-635`

### WAHA
- LID Controller: `api/lids.controller.ts:1-102`
- JID utilities: `core/utils/jids.ts:28-50, 118-144`
- Persistent store: `store/NowebPersistentStore.ts:104-142`
- SQLite repository: `store/sqlite3/Sqlite3LidPNRepository.ts`
- Group bug fix: `session.noweb.core.ts:636-639`
- Deduplication: `core/utils/reactive.ts:14-49`

### GREEN-API Adapter
- Message processing: `ghl/ghl.service.ts:441-444`
- Contact lookup: `ghl/ghl.service.ts:133-154`
- Outgoing messages: `ghl/ghl.service.ts:609-611`

---

## Recommendations

### If Staying with Evolution API
1. Add validation to ensure `remoteJidAlt` exists before processing
2. Add error logging when @lid messages lack alternative JIDs
3. Resolve the TODO comments in `onWhatsappCache.ts`
4. Create centralized @lid handling utility
5. Add monitoring/alerting for @lid resolution failures

### If Switching to WAHA
1. Built-in @lid handling should work out of the box
2. Use the `/api/{session}/lids/` endpoints for manual lookups
3. Monitor the LID database size over time

### If Keeping GREEN-API Adapter
1. **Critical:** Add @lid handling immediately
2. Replace regex `/[cg]\.us$/` with `/(@[cg]\.us|@lid)$/`
3. Add phone number extraction: `chatId.split('@')[0]`
4. Consider building LID-to-phone mapping table

### For the WhatsApp Bridge Pro Product
1. WAHA's architecture is the model to follow
2. Persistent LID-to-phone mapping is essential
3. All message paths must handle @lid
4. Add monitoring for unresolved @lid messages
5. Never silently drop - always log and alert

---

## Next Steps

- [ ] Task 2: Trace message status (sent/delivered/read) flow through each system
- [ ] Task 3: Compare architecture, tech stack, code quality
- [ ] Task 4: Final recommendation based on all findings
