# Phase 1 Research: @lid Handling

**Researched:** 2025-01-17
**Domain:** WhatsApp JID processing, phone extraction
**Confidence:** HIGH

## Summary

The codebase has multiple locations where WhatsApp JIDs (remoteJid) are converted to phone numbers. Currently, only `@s.whatsapp.net` and `@g.us` suffixes are handled, causing `@lid` identifiers (used by ~30-40% of Android users) to pass through intact and create invalid phone numbers that GHL rejects.

The fix is straightforward: replace all format-specific regex/string operations with `split('@')[0]` which handles all JID formats uniformly. Three files need modification, with changes concentrated in `ghl.service.ts` where the primary phone extraction happens.

**Primary recommendation:** Create a `jid.utils.ts` utility file with a single `extractPhoneFromJid()` function, then update all phone extraction points to use it.

## Current Implementation

### Phone Extraction Code

**File: `/Users/malone/evo-api-ghl/src/ghl/ghl.service.ts`**

| Line | Current Code | Problem |
|------|--------------|---------|
| 519 | `remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "")` | Only handles @s.whatsapp.net and @g.us, not @lid |
| 585 | `msg.key.participant.replace(/@s\.whatsapp\.net$/, "")` | Group participant extraction misses @lid |

**File: `/Users/malone/evo-api-ghl/src/ghl/ghl.transformer.ts`**

| Line | Current Code | Problem |
|------|--------------|---------|
| 268 | `senderNumber.split("@c.us")[0]` | Assumes @c.us format, fails for @lid |
| 282 | `webhook.from?.replace("@c.us", "")` | Only handles @c.us suffix |

**File: `/Users/malone/evo-api-ghl/src/evolution/evolution-api.client.ts`**

| Line | Current Code | Problem |
|------|--------------|---------|
| 160 | `phone.replace(/@[cgs]\.us$/, "")` | Regex only matches @c.us, @g.us, @s.us - not @lid |

### Data Flow

```
INBOUND MESSAGE:
Evolution API Webhook
  └─> ghl.service.ts:handleMessagesUpsert() [line 506]
      └─> Extract phone from msg.key.remoteJid [line 519]
          └─> Upsert contact in GHL [line 592]
              └─> Send message to GHL conversation [line 600]

OUTBOUND MESSAGE:
GHL Webhook
  └─> ghl.service.ts:handleGhlOutboundMessage() [line 672]
      └─> formatPhoneNumber() adds @c.us suffix [line 689]
          └─> Send to Evolution API

GROUP MESSAGE (inbound):
  └─> ghl.service.ts:handleMessagesUpsert() [line 506]
      └─> Check isGroup via remoteJid.endsWith("@g.us") [line 521]
      └─> Extract participant phone [line 585]
```

## Required Changes

### File: `/Users/malone/evo-api-ghl/src/ghl/jid.utils.ts` (NEW)
Create utility file with:
- `extractPhoneFromJid(jid: string): string` - Returns phone via `split('@')[0]`
- `isGroupJid(jid: string): boolean` - Returns `jid?.endsWith('@g.us')`
- `isLidJid(jid: string): boolean` - Returns `jid?.endsWith('@lid')` (for logging)
- `formatJid(phone: string, type: 'private' | 'group'): string` - Creates @c.us or @g.us JID

### File: `/Users/malone/evo-api-ghl/src/ghl/ghl.service.ts`
- **Line 519**: Replace chained `.replace()` calls with `extractPhoneFromJid(remoteJid)`
- **Line 585**: Replace `.replace(/@s\.whatsapp\.net$/, "")` with `extractPhoneFromJid(participant)`
- **Add import**: `import { extractPhoneFromJid, isLidJid } from './jid.utils';`
- **Add logging**: After line 518, add warning log if `isLidJid(remoteJid)` is true

### File: `/Users/malone/evo-api-ghl/src/ghl/ghl.transformer.ts`
- **Line 268**: Replace `senderNumber.split("@c.us")[0]` with `extractPhoneFromJid(senderNumber)`
- **Line 282**: Replace `webhook.from?.replace("@c.us", "")` with `extractPhoneFromJid(webhook.from)`
- **Add import**: `import { extractPhoneFromJid } from './jid.utils';`
- **Remove**: Duplicate `formatPhoneNumber()` helper (lines 45-48, use shared version)

### File: `/Users/malone/evo-api-ghl/src/evolution/evolution-api.client.ts`
- **Line 160**: Replace regex with `phone.split('@')[0]` or import utility
- Note: This file is for outbound only, so @lid risk is lower but consistency is important

## Edge Cases

### Group Chats (@g.us)
- **remoteJid**: `120363123456789012@g.us` (group ID, not a phone number)
- **participant**: `31612345678@s.whatsapp.net` OR `267215769174167@lid` (sender's JID)
- Current code checks `remoteJid.endsWith("@g.us")` for group detection - this is correct
- Phone extraction must happen on `participant`, not `remoteJid` for groups

### Broadcast Lists (@broadcast)
- Format: `status@broadcast` for status updates
- Not currently handled, but `split('@')[0]` safely returns "status"
- Low priority - these are typically system messages

### Newsletter Channels (@newsletter)
- Format: `120363123456789012@newsletter`
- WhatsApp channels are read-only, unlikely to generate inbound messages
- `split('@')[0]` safely extracts the identifier

### Null/Undefined JIDs
- Test file suggests `extractPhoneFromJid(null)` should return `""`
- Utility must handle falsy inputs gracefully

### Already-Clean Phone Numbers
- Some code paths may pass phone numbers without JID suffix
- `split('@')[0]` on `"31612345678"` safely returns `"31612345678"`

## Implementation Notes

### Ordering Concerns
1. Create `jid.utils.ts` first (other changes depend on it)
2. Update `ghl.service.ts` (primary message handling)
3. Update `ghl.transformer.ts` (secondary/legacy paths)
4. Update `evolution-api.client.ts` (outbound path)
5. Update tests to cover @lid cases

### Test Coverage
The existing test file (`ghl.transformer.spec.ts`) references methods that don't exist in the current implementation:
- `extractPhoneFromJid()` - tested but not implemented
- `isGroupMessage()` - tested but not implemented

These tests suggest the utility was planned but never created. The new `jid.utils.ts` should satisfy these test expectations.

### Logging Format
Per CONTEXT.md, log when @lid detected:
```typescript
if (isLidJid(remoteJid)) {
  this.logger.warn(`Processing @lid identifier: ${remoteJid} -> phone: ${phone}`);
}
```

### No Database Changes
This phase only affects runtime transformation. No schema changes, no migrations needed.

### Backward Compatibility
- `split('@')[0]` handles existing @s.whatsapp.net and @g.us formats identically
- Outbound messages continue to use @c.us format (Evolution API expects this)
- No API contract changes

## Code Examples

### Utility Function (jid.utils.ts)
```typescript
/**
 * Extracts phone number from WhatsApp JID
 * Handles all formats: @s.whatsapp.net, @c.us, @g.us, @lid
 */
export function extractPhoneFromJid(jid: string | null | undefined): string {
  if (!jid) return "";
  return jid.split("@")[0];
}

/**
 * Checks if JID is a group identifier
 */
export function isGroupJid(jid: string | null | undefined): boolean {
  return jid?.endsWith("@g.us") ?? false;
}

/**
 * Checks if JID uses @lid format (Android users)
 */
export function isLidJid(jid: string | null | undefined): boolean {
  return jid?.endsWith("@lid") ?? false;
}

/**
 * Formats phone number to WhatsApp JID
 */
export function formatJid(phone: string, type: "private" | "group" = "private"): string {
  const cleaned = phone.replace(/\D/g, "");
  return type === "group" ? `${cleaned}@g.us` : `${cleaned}@c.us`;
}
```

### Usage in ghl.service.ts
```typescript
// Before (line 519)
const phone = remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "");

// After
const phone = extractPhoneFromJid(remoteJid);
if (isLidJid(remoteJid)) {
  this.logger.warn(`Processing @lid identifier: ${remoteJid} -> ${phone}`);
}
```

## JID Format Reference

| Format | Example | Description | Prevalence |
|--------|---------|-------------|------------|
| @s.whatsapp.net | `31612345678@s.whatsapp.net` | Standard phone-based JID | ~60-70% |
| @lid | `267215769174167@lid` | Android Linked ID | ~30-40% |
| @c.us | `31612345678@c.us` | Legacy consumer format | Legacy |
| @g.us | `120363123456789012@g.us` | Group identifier | Groups |
| @broadcast | `status@broadcast` | Broadcast/status | System |
| @newsletter | `120363...@newsletter` | Channels | Channels |

## Sources

### Primary (HIGH confidence)
- Source code analysis: `/Users/malone/evo-api-ghl/src/ghl/ghl.service.ts`
- Source code analysis: `/Users/malone/evo-api-ghl/src/ghl/ghl.transformer.ts`
- Source code analysis: `/Users/malone/evo-api-ghl/src/evolution/evolution-api.client.ts`
- Existing research: `/Users/malone/evo-api-ghl/.planning/research/task1-lid-research.md`

### Context
- Phase decisions: `/Users/malone/evo-api-ghl/.planning/phases/01-lid-handling/01-CONTEXT.md`

## Metadata

**Confidence breakdown:**
- Phone extraction locations: HIGH - verified by source code analysis
- JID formats: HIGH - verified by existing research and industry documentation
- Edge cases: MEDIUM - based on WhatsApp known formats, may be others

**Research date:** 2025-01-17
**Valid until:** Stable - JID formats are well-established
