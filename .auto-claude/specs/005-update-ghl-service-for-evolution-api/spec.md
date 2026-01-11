# Specification: Update GHL Service for Evolution API

## Overview

This task migrates the main GHL service from using the GREEN-API SDK (`@green-api/greenapi-integration`) to the Evolution API HTTP client. The GHL service is the core integration logic that handles bidirectional message flow between GoHighLevel's conversation system and WhatsApp. By switching to Evolution API, we enable self-hosted WhatsApp instance management while maintaining the same GHL integration patterns. This requires updating instance creation, webhook handling, and message sending methods throughout the service.

## Workflow Type

**Type**: feature

**Rationale**: This is a significant migration that introduces new functionality patterns (Evolution API integration) while replacing existing functionality (GREEN-API SDK). It involves changes to multiple methods, new imports, and updated data flows, but follows established NestJS patterns already present in the codebase.

## Task Scope

### Services Involved
- **main** (primary) - NestJS backend service containing the GHL integration logic
- **Evolution API** (external) - Self-hosted WhatsApp API server (consumed via HTTP client)

### This Task Will:
- [ ] Remove GREEN-API SDK imports and replace with Evolution API client
- [ ] Replace `GreenApiLogger` with NestJS native `Logger`
- [ ] Rename and refactor `createGreenApiInstanceForUser()` to `createEvolutionInstanceForUser()`
- [ ] Rename and refactor `handleGreenApiWebhook()` to `handleEvolutionWebhook()`
- [ ] Update `handlePlatformWebhook()` to use Evolution API client for sending messages
- [ ] Update `handleWorkflowAction()` to use Evolution API client
- [ ] Import `EvolutionModule` in `ghl.module.ts`
- [ ] Remove `createGreenApiClient()` method entirely

### Out of Scope:
- Database schema migration (handled in separate task)
- Evolution API client implementation (already complete in worktree)
- Transformer updates for Evolution message formats (separate task)
- Webhook controller endpoint changes (separate task)
- OAuth flow modifications

## Service Context

### Main Service

**Tech Stack:**
- Language: TypeScript
- Framework: NestJS
- ORM: Prisma
- Key directories: `src/ghl/`, `src/evolution/`, `src/webhooks/`

**Entry Point:** `src/main.ts`

**How to Run:**
```bash
npm run start
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `src/ghl/ghl.service.ts` | main | Replace GREEN-API SDK with Evolution API client; rename/refactor instance creation and webhook methods; update message sending logic |
| `src/ghl/ghl.module.ts` | main | Import `EvolutionModule` to make `EvolutionApiClient` available |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/evolution/evolution-api.client.ts` | Evolution API client instantiation, method signatures for `sendText()`, `sendMedia()`, `getConnectionState()`, `setWebhook()` |
| `src/evolution/evolution-api.types.ts` | Type definitions for Evolution API requests/responses |
| `src/evolution/evolution.module.ts` | Module export pattern for Evolution API client |
| `src/ghl/ghl.transformer.ts` | Current transformer patterns (will need Evolution-specific methods) |

## Patterns to Follow

### Evolution API Client Instantiation

From `src/evolution/evolution-api.client.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class EvolutionApiClient {
  private readonly logger = new Logger(EvolutionApiClient.name);

  constructor(baseUrl: string, apiKey: string) {
    // Client setup with axios
  }

  async sendText(instance: string, request: SendTextRequest): Promise<SendMessageResponse> {
    // POST /message/sendText/{instance}
  }

  async sendMedia(instance: string, request: SendMediaRequest): Promise<SendMessageResponse> {
    // POST /message/sendMedia/{instance}
  }

  async getConnectionState(instance: string): Promise<ConnectionStateResponse> {
    // GET /instance/connectionState/{instance}
  }

  async setWebhook(instance: string, request: SetWebhookRequest): Promise<SetWebhookResponse> {
    // POST /webhook/set/{instance}
  }
}
```

**Key Points:**
- Client requires `baseUrl` and `apiKey` in constructor (per-instance credentials)
- All methods take `instance` (instanceName) as first parameter
- Use NestJS `Logger` instead of `GreenApiLogger`

### NestJS Logger Pattern

Replace `GreenApiLogger` usage:

```typescript
// OLD (GREEN-API)
import { GreenApiLogger } from "@green-api/greenapi-integration";
private readonly gaLogger = GreenApiLogger.getInstance(GhlService.name);
this.gaLogger.log("message");
this.gaLogger.error("error");

// NEW (NestJS Native)
import { Logger } from "@nestjs/common";
private readonly logger = new Logger(GhlService.name);
this.logger.log("message");
this.logger.error("error");
```

### Instance Lookup Pattern

Current code uses `idInstance` (BigInt). Evolution API uses `instanceName` (string):

```typescript
// OLD
const instance = await this.prisma.getInstance(BigInt(idInstance));
const greenApiClient = this.createGreenApiClient(instance);

// NEW
const instance = await this.prisma.getInstanceByName(instanceName);
const evolutionClient = new EvolutionApiClient(
  instance.evolutionApiUrl,
  instance.evolutionApiKey
);
```

## Requirements

### Functional Requirements

1. **Replace GREEN-API imports with Evolution API client**
   - Description: Remove all imports from `@green-api/greenapi-integration` and import `EvolutionApiClient` from `../evolution/evolution-api.client`
   - Acceptance: Service compiles without GREEN-API package; Evolution client is properly imported

2. **Replace GreenApiLogger with NestJS Logger**
   - Description: All logging should use NestJS native Logger instead of GreenApiLogger
   - Acceptance: No references to `GreenApiLogger`; all log statements use `this.logger`

3. **Rename createGreenApiInstanceForUser to createEvolutionInstanceForUser**
   - Description: Update method signature to accept `(locationId, instanceName, evolutionApiUrl, evolutionApiKey, name?)` instead of `(locationId, idInstance, apiToken, name?)`
   - Acceptance: Method creates EvolutionApiClient, verifies connection, registers webhook, saves to database

4. **Rename handleGreenApiWebhook to handleEvolutionWebhook**
   - Description: Parse Evolution webhook format `{event, instance, data}` and route by event type
   - Acceptance: Handles `messages.upsert` and `connection.update` events correctly

5. **Update message sending in handlePlatformWebhook**
   - Description: Use EvolutionApiClient.sendText() and sendMedia() instead of greenApiClient methods
   - Acceptance: Outbound messages from GHL are successfully sent via Evolution API

6. **Update handleWorkflowAction to use Evolution API**
   - Description: Replace all GREEN-API client calls with Evolution API client calls
   - Acceptance: Workflow actions (message, file, buttons) work via Evolution API

7. **Import EvolutionModule in GhlModule**
   - Description: Add EvolutionModule to imports in ghl.module.ts
   - Acceptance: GhlModule can access EvolutionApiClient

### Edge Cases

1. **Instance not found** - Return appropriate error when instanceName doesn't exist in database
2. **Evolution API connection failure** - Handle network errors when calling Evolution API
3. **Invalid credentials** - Handle 401 responses from Evolution API gracefully
4. **Instance not connected** - Check connection state before sending messages (state !== "open")
5. **Webhook registration failure** - Handle failures when setting webhook URL on Evolution instance
6. **Missing evolutionApiUrl/Key** - Validate instance has Evolution API credentials before creating client

## Implementation Notes

### DO
- Follow the Evolution API client pattern in `src/evolution/evolution-api.client.ts`
- Use NestJS native `Logger` for all logging
- Create new `EvolutionApiClient` instances per-instance (they store instance-specific credentials)
- Validate connection state before performing operations
- Register webhooks with events: `['MESSAGES_UPSERT', 'CONNECTION_UPDATE']`
- Map Evolution connection states to database states: `open` -> `authorized`, `close`/`connecting` -> `notAuthorized`

### DON'T
- Don't keep any references to `@green-api/greenapi-integration` package
- Don't use `GreenApiLogger` - use NestJS Logger
- Don't assume `idInstance` field - use `instanceName`
- Don't modify the OAuth flow or GHL API calls (they remain unchanged)
- Don't change the webhook endpoint URLs yet (that's a separate task)

## Development Environment

### Start Services

```bash
# Start the NestJS application
npm run start

# Or in development mode with watch
npm run start:dev

# Start database (if using docker-compose)
docker-compose up -d db
```

### Service URLs
- Main API: http://localhost:3000
- Database: localhost:3306 (MySQL)

### Required Environment Variables
- `DATABASE_URL`: MySQL connection string
- `GHL_CLIENT_ID`: GoHighLevel OAuth client ID
- `GHL_CLIENT_SECRET`: GoHighLevel OAuth client secret
- `GHL_CONVERSATION_PROVIDER_ID`: GHL conversation provider ID
- `APP_URL`: Base URL for this application (used for webhook URLs)
- `GHL_SHARED_SECRET`: Shared secret for GHL webhook verification
- `GHL_WORKFLOW_TOKEN`: Token for workflow action authentication
- `GHL_APP_ID`: GoHighLevel application ID
- `EVOLUTION_API_URL`: Base URL for Evolution API server (new)
- `EVOLUTION_API_KEY`: Global API key for Evolution API (new)

## Success Criteria

The task is complete when:

1. [ ] All GREEN-API imports removed from `ghl.service.ts`
2. [ ] EvolutionApiClient properly imported and used
3. [ ] `createEvolutionInstanceForUser()` creates instances with Evolution API
4. [ ] `handleEvolutionWebhook()` processes Evolution webhook events
5. [ ] Outbound messages sent via Evolution API `sendText()`/`sendMedia()`
6. [ ] Workflow actions use Evolution API client
7. [ ] GhlModule imports EvolutionModule
8. [ ] NestJS Logger used throughout (no GreenApiLogger)
9. [ ] No console errors on service startup
10. [ ] Existing TypeScript compilation passes

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Instance creation | `src/ghl/ghl.service.spec.ts` | `createEvolutionInstanceForUser()` calls Evolution API client methods |
| Webhook handling | `src/ghl/ghl.service.spec.ts` | `handleEvolutionWebhook()` correctly routes message and connection events |
| Message sending | `src/ghl/ghl.service.spec.ts` | Outbound messages use Evolution API client |
| Workflow actions | `src/ghl/ghl.service.spec.ts` | All workflow action types use Evolution API |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| GHL to Evolution flow | GhlService <-> EvolutionApiClient | GHL outbound message reaches Evolution API |
| Evolution to GHL flow | EvolutionApiClient -> GhlService | Evolution webhook creates GHL inbound message |
| Instance provisioning | GhlService <-> Database <-> EvolutionApiClient | New instance saved with correct fields |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Create instance | 1. Call createEvolutionInstanceForUser 2. Verify DB | Instance saved with evolutionApiUrl, evolutionApiKey |
| Receive message | 1. POST Evolution webhook 2. Check GHL API call | Message forwarded to GHL conversation |
| Send message | 1. POST GHL webhook 2. Check Evolution API call | Message sent via Evolution API |

### Code Verification
| Check | Command | Expected |
|-------|---------|----------|
| No GREEN-API imports | `grep -r "green-api" src/ghl/ghl.service.ts` | No matches |
| No GreenApiLogger | `grep -r "GreenApiLogger" src/ghl/` | No matches |
| TypeScript compilation | `npm run build` | No errors |
| Module imports | Review `ghl.module.ts` | EvolutionModule imported |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Schema compatibility | `npx prisma validate` | Schema valid |
| Instance fields | Check Instance model | Has instanceName, evolutionApiUrl, evolutionApiKey fields |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Code follows established patterns
- [ ] No regressions in existing functionality
- [ ] No security vulnerabilities introduced
- [ ] GREEN-API package fully removed from service
- [ ] Logger migration complete
