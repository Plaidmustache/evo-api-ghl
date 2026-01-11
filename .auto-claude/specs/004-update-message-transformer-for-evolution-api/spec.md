# Specification: Update Message Transformer for Evolution API

## Overview

This task updates the message transformer (`src/ghl/ghl.transformer.ts`) to convert between Evolution API webhook format and GoHighLevel message format, replacing the existing GREEN-API integration. The transformer is the critical bidirectional translation layer that enables WhatsApp messages from Evolution API to be displayed in GHL's conversation UI and allows GHL outbound messages to be sent via Evolution API. This is a one-sided refactor: only the Evolution API side changes while the GHL platform message format remains completely unchanged.

## Workflow Type

**Type**: feature

**Rationale**: This is a focused feature update that modifies a single transformation module to support a new external API (Evolution API) while maintaining backward compatibility with the existing GHL integration. The scope is well-defined with clear input/output contracts.

## Task Scope

### Services Involved
- **main** (primary) - NestJS backend containing the message transformer

### This Task Will:
- [x] Update `toPlatformMessage()` method to parse Evolution API webhook format instead of GREEN-API
- [x] Rename `toGreenApiMessage()` to `toEvolutionMessage()` and update output format
- [x] Add helper methods: `extractPhoneFromJid()` and `isGroupMessage()`
- [x] Handle 6 message types: conversation, extendedTextMessage, imageMessage, videoMessage, audioMessage, documentMessage
- [x] Remove GREEN-API SDK dependencies from transformer

### Out of Scope:
- GHL OAuth flow modifications
- Database schema changes
- Webhook controller changes (handled separately)
- Evolution API service implementation (separate task)
- GHL platform message format changes (must remain unchanged)

## Service Context

### Main Service

**Tech Stack:**
- Language: TypeScript
- Framework: NestJS
- ORM: Prisma
- Key directories: `src/ghl/` (transformer and service)

**Entry Point:** `src/main.ts`

**How to Run:**
```bash
npm run start
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `src/ghl/ghl.transformer.ts` | main | Complete refactor to support Evolution API webhook format for inbound, Evolution API message format for outbound |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `CLAUDE.md` | Evolution API webhook payload structure and endpoint documentation |
| `src/types.ts` | GhlPlatformMessage interface - output format must remain unchanged |
| `src/ghl/dto/ghl-webhook.dto.ts` | GhlWebhookDto - input format for outbound messages (unchanged) |

## Patterns to Follow

### Evolution API Webhook Payload Structure

From `CLAUDE.md`:

```json
{
  "event": "messages.upsert",
  "instance": "my-instance",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "ABC123"
    },
    "pushName": "John Doe",
    "message": {
      "conversation": "Hello!"
    },
    "messageType": "conversation",
    "messageTimestamp": 1704067200
  }
}
```

**Key Points:**
- Phone number is in `data.key.remoteJid` with suffix `@s.whatsapp.net` (individual) or `@g.us` (group)
- Sender name is in `data.pushName`
- Message content location varies by `messageType`
- Timestamp is Unix epoch in `data.messageTimestamp`

### GHL Platform Message Output Format

From `src/types.ts`:

```typescript
export interface GhlPlatformMessage {
  contactId: string;
  locationId: string;
  message: string;
  direction: "inbound";
  conversationProviderId?: string;
  attachments?: GhlPlatformAttachment[];
  timestamp?: Date;
}

interface GhlPlatformAttachment {
  url: string;
  fileName?: string;
  type?: string;
}
```

**Key Points:**
- This output format must remain EXACTLY as-is
- `contactId` and `locationId` are set to placeholders (resolved later in service layer)
- `direction` is always "inbound" for incoming messages
- `attachments` array structure is unchanged

### Evolution API Outbound Message Format

**Text Message:**
```typescript
{
  number: "5511999999999",  // Phone number without suffix
  text: "Hello!"
}
```

**Media Message:**
```typescript
{
  number: "5511999999999",
  mediatype: "image" | "video" | "document" | "audio",
  media: "https://example.com/file.jpg",  // URL to media
  caption: "Optional caption"
}
```

## Requirements

### Functional Requirements

1. **Inbound Message Transformation (Evolution API -> GHL)**
   - Description: Parse Evolution API webhook and produce GhlPlatformMessage
   - Acceptance: All 6 message types correctly parsed; phone numbers extracted from JID; timestamps converted

2. **Outbound Message Transformation (GHL -> Evolution API)**
   - Description: Convert GhlWebhookDto to Evolution API message format
   - Acceptance: Text messages produce `{ number, text }` format; media messages produce `{ number, mediatype, media, caption }` format

3. **Phone Number Extraction**
   - Description: Extract clean phone number from WhatsApp JID format
   - Acceptance: `5511999999999@s.whatsapp.net` becomes `5511999999999`; `5511999999999@g.us` becomes `5511999999999`

4. **Group Message Detection**
   - Description: Detect if message is from a group chat
   - Acceptance: Messages with `@g.us` suffix are identified as group messages

### Edge Cases

1. **Missing message content** - Return descriptive fallback text (e.g., "Received an image")
2. **Unknown message type** - Log warning and return generic message
3. **Missing pushName** - Use "Unknown" as sender name
4. **Extended text message** - Extract text from `data.message.extendedTextMessage.text`
5. **Media without caption** - Use descriptive text about media type received
6. **Empty attachments array** - Send as text-only message in outbound direction

## Implementation Notes

### DO
- Keep the `GhlPlatformMessage` output structure exactly the same
- Use `extractPhoneFromJid()` helper for all phone number extraction
- Handle all 6 message types explicitly in a switch statement
- Log unknown message types for debugging
- Preserve the `@Injectable()` decorator and class structure
- Convert Evolution API Unix timestamp (seconds) to JavaScript Date

### DON'T
- Modify `GhlPlatformMessage` interface or output format
- Change `GhlWebhookDto` structure (input from GHL is unchanged)
- Keep GREEN-API SDK imports or dependencies
- Use GREEN-API specific field names or patterns
- Hardcode instance IDs or API keys in transformer

### Message Type Mapping

| Evolution API `messageType` | Message Content Location | Attachment Handling |
|----------------------------|-------------------------|---------------------|
| `conversation` | `data.message.conversation` | None |
| `extendedTextMessage` | `data.message.extendedTextMessage.text` | None |
| `imageMessage` | `data.message.imageMessage.caption` | URL from `imageMessage` |
| `videoMessage` | `data.message.videoMessage.caption` | URL from `videoMessage` |
| `audioMessage` | N/A | URL from `audioMessage` |
| `documentMessage` | `data.message.documentMessage.caption` | URL from `documentMessage` |

## Development Environment

### Start Services

```bash
# Start the NestJS application
npm run start

# Or in development mode
npm run start:dev
```

### Service URLs
- Main API: http://localhost:3000

### Required Environment Variables
- `DATABASE_URL`: Database connection string
- `GHL_CLIENT_ID`: GoHighLevel OAuth client ID
- `GHL_CLIENT_SECRET`: GoHighLevel OAuth client secret
- `GHL_CONVERSATION_PROVIDER_ID`: GHL conversation provider ID
- `APP_URL`: Application base URL
- `GHL_SHARED_SECRET`: Shared secret for GHL webhooks
- `GHL_WORKFLOW_TOKEN`: Token for GHL workflow actions
- `GHL_APP_ID`: GoHighLevel application ID

## Success Criteria

The task is complete when:

1. [x] `toPlatformMessage()` correctly parses Evolution API webhook format
2. [x] All 6 message types (conversation, extendedTextMessage, imageMessage, videoMessage, audioMessage, documentMessage) are handled
3. [x] `toEvolutionMessage()` produces correct Evolution API format for text and media messages
4. [x] Phone numbers are correctly extracted from JID format (stripping @s.whatsapp.net and @g.us)
5. [x] Group messages are detected via `@g.us` suffix
6. [x] GhlPlatformMessage output format remains unchanged
7. [x] No console errors
8. [x] GREEN-API imports removed from transformer
9. [x] TypeScript compiles without errors

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| toPlatformMessage - conversation | `src/ghl/ghl.transformer.spec.ts` | Parses `data.message.conversation` correctly |
| toPlatformMessage - extendedTextMessage | `src/ghl/ghl.transformer.spec.ts` | Parses `data.message.extendedTextMessage.text` correctly |
| toPlatformMessage - imageMessage | `src/ghl/ghl.transformer.spec.ts` | Extracts image URL and caption |
| toPlatformMessage - videoMessage | `src/ghl/ghl.transformer.spec.ts` | Extracts video URL and caption |
| toPlatformMessage - audioMessage | `src/ghl/ghl.transformer.spec.ts` | Extracts audio URL |
| toPlatformMessage - documentMessage | `src/ghl/ghl.transformer.spec.ts` | Extracts document URL and filename |
| extractPhoneFromJid - individual | `src/ghl/ghl.transformer.spec.ts` | Strips `@s.whatsapp.net` suffix |
| extractPhoneFromJid - group | `src/ghl/ghl.transformer.spec.ts` | Strips `@g.us` suffix |
| isGroupMessage | `src/ghl/ghl.transformer.spec.ts` | Returns true for `@g.us`, false for `@s.whatsapp.net` |
| toEvolutionMessage - text | `src/ghl/ghl.transformer.spec.ts` | Produces `{ number, text }` format |
| toEvolutionMessage - media | `src/ghl/ghl.transformer.spec.ts` | Produces `{ number, mediatype, media, caption }` format |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Inbound message flow | Transformer -> Service | GhlPlatformMessage is correctly formatted for GHL API |
| Outbound message flow | GHL Webhook -> Transformer | Evolution API message format is valid for sendText/sendMedia endpoints |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Receive text message | 1. Evolution API sends webhook 2. Transformer parses 3. GHL receives message | Message appears in GHL conversation |
| Receive image | 1. Evolution API sends image webhook 2. Transformer extracts URL 3. GHL receives with attachment | Image attachment visible in GHL |
| Send text from GHL | 1. GHL sends outbound webhook 2. Transformer formats 3. Evolution API receives | Message delivered to WhatsApp |
| Send attachment from GHL | 1. GHL sends with attachment 2. Transformer formats media 3. Evolution API receives | Media delivered to WhatsApp |

### Code Verification
| Check | Command | Expected |
|-------|---------|----------|
| TypeScript compiles | `npm run build` | No errors |
| No GREEN-API imports | `grep -r "greenapi" src/ghl/ghl.transformer.ts` | No matches |
| Method renamed | `grep "toEvolutionMessage" src/ghl/ghl.transformer.ts` | Method exists |
| Helper methods exist | `grep -E "extractPhoneFromJid|isGroupMessage" src/ghl/ghl.transformer.ts` | Both methods exist |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] TypeScript builds without errors
- [ ] GREEN-API dependencies removed from transformer
- [ ] All 6 message types handled in switch statement
- [ ] Phone extraction works for both individual and group JIDs
- [ ] Output format matches GhlPlatformMessage interface exactly
- [ ] No regressions in existing GHL integration
- [ ] Code follows NestJS/TypeScript patterns from existing codebase
