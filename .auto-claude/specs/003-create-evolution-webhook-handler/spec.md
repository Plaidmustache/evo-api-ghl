# Specification: Evolution API Webhook Handler

## Overview

This task migrates the webhook handling system from GreenAPI to Evolution API format. The changes involve renaming the webhook guard class from `GreenApiWebhookGuard` to `EvolutionWebhookGuard`, updating validation logic to handle Evolution API's webhook payload structure, changing the webhook endpoint from `/webhooks/green-api` to `/webhooks/evolution`, and implementing handlers for Evolution API's event types (`messages.upsert` for incoming messages and `connection.update` for state changes). This enables the GHL integration to receive WhatsApp messages and connection state updates from Evolution API instead of GreenAPI.

## Workflow Type

**Type**: feature

**Rationale**: This task adds new webhook handling capability for Evolution API while replacing the existing GreenAPI implementation. It involves creating a new guard, updating controller endpoints, implementing new event parsing logic, and adding helper methods for phone number extraction - all characteristic of a feature implementation.

## Task Scope

### Services Involved
- **main** (primary) - NestJS backend handling webhook reception, validation, and message routing to GHL

### This Task Will:
- [ ] Rename `src/webhooks/guards/greenapi-webhook.guard.ts` to `evolution-webhook.guard.ts`
- [ ] Rename class from `GreenApiWebhookGuard` to `EvolutionWebhookGuard`
- [ ] Update guard validation logic to validate Evolution API webhook format
- [ ] Validate instance exists in database by matching `instance` field from webhook
- [ ] Change endpoint from `@Post('green-api')` to `@Post('evolution')`
- [ ] Update guard decorator to `@UseGuards(EvolutionWebhookGuard)`
- [ ] Implement `messages.upsert` event handling to route messages to GHL
- [ ] Implement `connection.update` event handling to update instance state in DB
- [ ] Add phone number extraction utility (remove `@s.whatsapp.net` or `@g.us` suffix from `remoteJid`)
- [ ] Create DTOs/interfaces for Evolution API webhook payloads
- [ ] Update module imports to use new guard name

### Out of Scope:
- Database schema changes (using existing Instance model)
- Modifying the GHL message sending logic
- OAuth flow changes
- Custom page/UI changes
- GreenAPI to Evolution API migration for outbound messages (separate task)

## Service Context

### Main Service (NestJS Backend)

**Tech Stack:**
- Language: TypeScript
- Framework: NestJS
- ORM: Prisma
- Database: MySQL
- Key directories: `src/webhooks/`, `src/ghl/`, `src/prisma/`

**Entry Point:** `src/main.ts`

**How to Run:**
```bash
npm run start
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `src/webhooks/guards/greenapi-webhook.guard.ts` | main | Rename to `evolution-webhook.guard.ts`, update class name and validation logic |
| `src/webhooks/webhooks.controller.ts` | main | Change endpoint path, update guard import/decorator, implement Evolution API event handling |
| `src/webhooks/webhooks.module.ts` | main | Update import to use `EvolutionWebhookGuard` |

## Files to Create

| File | Service | Purpose |
|------|---------|---------|
| `src/webhooks/dto/evolution-webhook.dto.ts` | main | TypeScript interfaces for Evolution API webhook payloads |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/webhooks/guards/greenapi-webhook.guard.ts` | Guard structure and canActivate pattern |
| `src/webhooks/webhooks.controller.ts` | Controller endpoint pattern, async webhook handling with early response |
| `src/ghl/ghl.service.ts` | Message handling flow, phone number normalization patterns |
| `src/prisma/prisma.service.ts` | Database query patterns for instance lookup |

## Patterns to Follow

### Guard Pattern (NestJS CanActivate)

From `src/webhooks/guards/greenapi-webhook.guard.ts`:

```typescript
@Injectable()
export class EvolutionWebhookGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return this.validateRequest(request);
  }

  private async validateRequest(request: Request): Promise<boolean> {
    // Validate Evolution API webhook payload
    // Check instance exists in database
  }
}
```

**Key Points:**
- Guard must be `@Injectable()` and implement `CanActivate`
- Inject `PrismaService` for database validation
- Return `false` to reject request, `true` to allow

### Async Webhook Handler Pattern

From `src/webhooks/webhooks.controller.ts` (lines 26-37):

```typescript
@Post("evolution")
@UseGuards(EvolutionWebhookGuard)
@HttpCode(HttpStatus.OK)
async handleEvolutionWebhook(@Body() webhook: EvolutionWebhookDto, @Res() res: Response): Promise<void> {
  this.logger.debug(`Evolution API Webhook Body: ${JSON.stringify(webhook)}`);
  res.status(HttpStatus.OK).send(); // Respond immediately
  try {
    // Process webhook asynchronously
  } catch (error) {
    this.logger.error(`Error processing Evolution API webhook`, error);
  }
}
```

**Key Points:**
- Send HTTP 200 response immediately before processing
- Handle errors gracefully with logging (don't throw after response sent)
- Use `@HttpCode(HttpStatus.OK)` decorator

### Phone Number Extraction Pattern

From `src/ghl/ghl.service.ts` (line 444):

```typescript
const contactIdentifier = webhook.senderData.chatId.replace(/@[cg]\.us$/, "");
```

**Key Points:**
- Strip WhatsApp JID suffixes: `@s.whatsapp.net`, `@c.us`, `@g.us`
- Use regex for clean extraction
- Handle both individual (`@s.whatsapp.net`) and group (`@g.us`) formats

## Evolution API Webhook Payload Structure

### messages.upsert Event

```typescript
interface EvolutionMessagesUpsertWebhook {
  event: "messages.upsert";
  instance: string;  // Instance name (e.g., "my-instance")
  data: {
    key: {
      remoteJid: string;  // "5511999999999@s.whatsapp.net" or "group@g.us"
      fromMe: boolean;
      id: string;  // Message ID
    };
    pushName: string;  // Sender's display name
    message: {
      conversation?: string;  // Text message content
      // Other message types: imageMessage, audioMessage, etc.
    };
    messageType: string;  // "conversation", "imageMessage", etc.
    messageTimestamp: number;  // Unix timestamp
  };
}
```

### connection.update Event

```typescript
interface EvolutionConnectionUpdateWebhook {
  event: "connection.update";
  instance: string;
  data: {
    state: "open" | "close" | "connecting";
    statusReason?: number;
  };
}
```

## Requirements

### Functional Requirements

1. **Guard Validation**
   - Description: Validate incoming webhooks have valid structure and instance exists in database
   - Acceptance: Guard returns `true` only when payload has `event`, `instance` fields and instance exists in DB

2. **Instance Lookup by Name**
   - Description: Look up instance using the `instance` field from webhook (string instance name)
   - Acceptance: Successfully find instance using the `name` field in Instance model
   - Note: Current Instance model has a `name` field that can be used for this lookup

3. **Message Event Handling (messages.upsert)**
   - Description: Parse incoming message webhooks and route to GHL
   - Acceptance: Messages from Evolution API appear as inbound messages in GHL conversations

4. **Connection State Handling (connection.update)**
   - Description: Update instance state in database when connection state changes
   - Acceptance: Instance `stateInstance` field updates when connection.update webhook received
   - State Mapping:
     - `open` -> `authorized`
     - `close` -> `notAuthorized`
     - `connecting` -> `starting`

5. **Phone Number Extraction**
   - Description: Extract clean phone number from Evolution API's `remoteJid` format
   - Acceptance: `5511999999999@s.whatsapp.net` -> `5511999999999`
   - Also handle: `5511999999999@c.us` and `groupid@g.us`

6. **Endpoint Change**
   - Description: Change webhook endpoint from `/webhooks/green-api` to `/webhooks/evolution`
   - Acceptance: POST requests to `/webhooks/evolution` are handled correctly

### Edge Cases

1. **Unknown Event Type** - Log warning and return OK (don't fail)
2. **Instance Not Found** - Guard should reject with 401/403, log the attempt
3. **Message from Self (fromMe: true)** - Skip processing to avoid echo loops
4. **Group Messages** - Handle `@g.us` suffix differently, extract group ID
5. **Empty Message Content** - Handle gracefully, log warning
6. **Missing pushName** - Default to "Unknown" or phone number
7. **Duplicate Webhook** - Handle idempotently (same message ID shouldn't create duplicate)

## Implementation Notes

### DO
- Follow the existing guard pattern from `greenapi-webhook.guard.ts`
- Reuse `PrismaService` for database operations
- Use the existing `GhlService.sendToPlatform()` for forwarding to GHL
- Send HTTP 200 immediately before processing (existing pattern)
- Log all webhook events for debugging
- Map Evolution API states to existing `InstanceState` enum values
- Use the `name` field on Instance model for instance lookup

### DON'T
- Don't modify the database schema (use existing fields)
- Don't change the GHL message sending logic
- Don't remove the old GreenAPI endpoint yet (may need for transition)
- Don't process messages where `fromMe: true`
- Don't throw exceptions after sending HTTP response

## State Mapping

| Evolution API State | Database InstanceState |
|---------------------|------------------------|
| `open` | `authorized` |
| `close` | `notAuthorized` |
| `connecting` | `starting` |

## Development Environment

### Start Services

```bash
# Start the application
npm run start

# Or with watch mode for development
npm run start:dev

# Start database (if using Docker)
docker-compose up -d db
```

### Service URLs
- Main Application: http://localhost:3000
- Webhook Endpoint: http://localhost:3000/webhooks/evolution

### Required Environment Variables
- `DATABASE_URL`: MySQL connection string
- `GHL_CLIENT_ID`: GoHighLevel OAuth client ID
- `GHL_CLIENT_SECRET`: GoHighLevel OAuth client secret
- `GHL_CONVERSATION_PROVIDER_ID`: GHL conversation provider identifier
- `APP_URL`: Application base URL (for webhook registration)
- `GHL_SHARED_SECRET`: GHL webhook validation secret

## Success Criteria

The task is complete when:

1. [ ] `evolution-webhook.guard.ts` exists with `EvolutionWebhookGuard` class
2. [ ] Guard validates webhook structure and instance existence
3. [ ] Endpoint `/webhooks/evolution` accepts POST requests
4. [ ] `messages.upsert` events create inbound messages in GHL
5. [ ] `connection.update` events update instance state in database
6. [ ] Phone numbers correctly extracted from `remoteJid` format
7. [ ] No console errors during normal operation
8. [ ] Existing tests still pass
9. [ ] Module imports updated to use new guard

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Guard validates valid webhook | `src/webhooks/guards/evolution-webhook.guard.spec.ts` | Guard returns true for valid payload with existing instance |
| Guard rejects invalid webhook | `src/webhooks/guards/evolution-webhook.guard.spec.ts` | Guard returns false for missing fields or non-existent instance |
| Phone extraction utility | `src/webhooks/webhooks.controller.spec.ts` | Correctly strips @s.whatsapp.net and @g.us suffixes |
| State mapping | `src/webhooks/webhooks.controller.spec.ts` | Evolution states map correctly to InstanceState enum |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Webhook → Database | webhooks ↔ prisma | Instance state updates on connection.update webhook |
| Webhook → GHL | webhooks ↔ ghl | Messages.upsert creates GHL inbound message |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Message Reception | 1. POST webhook to /webhooks/evolution with messages.upsert 2. Check GHL | Message appears in GHL conversation |
| Connection Update | 1. POST webhook with connection.update (state: open) 2. Query database | Instance stateInstance = authorized |

### API Verification
| Endpoint | Method | Test Request | Expected Response |
|----------|--------|--------------|-------------------|
| `/webhooks/evolution` | POST | Valid messages.upsert payload | 200 OK |
| `/webhooks/evolution` | POST | Invalid payload (missing instance) | 401/403 |
| `/webhooks/evolution` | POST | Unknown instance name | 401/403 |

### Database Verification
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Instance state after open | `SELECT stateInstance FROM Instance WHERE name='test-instance'` | `authorized` |
| Instance state after close | `SELECT stateInstance FROM Instance WHERE name='test-instance'` | `notAuthorized` |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] API endpoints respond correctly
- [ ] Database state verified after webhooks
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced
- [ ] Logging appropriate for debugging
- [ ] Edge cases handled gracefully
