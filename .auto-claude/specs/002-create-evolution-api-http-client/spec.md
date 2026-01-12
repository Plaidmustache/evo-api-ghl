# Specification: Create Evolution API HTTP Client Service

## Overview

This task creates a new Evolution API HTTP client service to replace the existing GREEN-API SDK integration. Evolution API is a free, self-hosted Baileys-based WhatsApp API that will serve as the messaging backbone for the GHL integration. The new client will handle all HTTP communication with Evolution API, including sending text/media messages, checking connection states, configuring webhooks, and fetching instances.

## Workflow Type

**Type**: feature

**Rationale**: This is a greenfield implementation creating new files (`src/evolution/evolution-api.client.ts` and `src/evolution/evolution.module.ts`) without modifying existing code. It introduces new functionality that will eventually replace the GREEN-API SDK but currently stands as an independent service addition.

## Task Scope

### Services Involved
- **main** (primary) - NestJS backend service where the Evolution API client will be created

### This Task Will:
- [ ] Create `src/evolution/evolution-api.client.ts` - HTTP client service for Evolution API communication
- [ ] Create `src/evolution/evolution.module.ts` - NestJS module exporting the client as a provider
- [ ] Implement 6 core methods: constructor, sendText, sendMedia, getConnectionState, setWebhook, fetchInstances
- [ ] Add proper error handling with NestJS Logger
- [ ] Configure axios with persistent apikey header authentication

### Out of Scope:
- Modifying existing GHL service to use the new client
- Database schema changes
- Removing or modifying GREEN-API SDK integration
- Creating integration tests with actual Evolution API
- Updating webhook handlers to process Evolution API events

## Service Context

### Main Service

**Tech Stack:**
- Language: TypeScript
- Framework: NestJS
- ORM: Prisma
- HTTP Client: axios (via @nestjs/axios)
- Key directories: `src/`

**Entry Point:** `src/main.ts`

**How to Run:**
```bash
npm run start
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `src/evolution/evolution-api.client.ts` | main | **CREATE** - New HTTP client service |
| `src/evolution/evolution.module.ts` | main | **CREATE** - New NestJS module |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/prisma/prisma.module.ts` | Simple NestJS module structure with providers and exports |
| `src/prisma/prisma.service.ts` | Injectable service with `@Injectable()` decorator |
| `src/ghl/ghl.service.ts` | Axios HTTP client creation, error handling, and logging patterns |
| `src/app.module.ts` | How modules are imported into the application |

## Patterns to Follow

### NestJS Module Pattern

From `src/prisma/prisma.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
```

**Key Points:**
- Use `@Module` decorator with `providers` and `exports`
- Export the service for dependency injection in other modules
- Optionally use `@Global()` for app-wide availability

### Injectable Service Pattern

From `src/prisma/prisma.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    async onModuleInit() {
        await this.$connect();
    }
    // ... methods
}
```

**Key Points:**
- Use `@Injectable()` decorator
- Implement lifecycle hooks if needed (e.g., `OnModuleInit`)

### Axios HTTP Client Pattern

From `src/ghl/ghl.service.ts`:

```typescript
import axios, { AxiosInstance, AxiosError } from "axios";

private async getHttpClient(ghlUserId: string): Promise<AxiosInstance> {
    const httpClient = axios.create({
        baseURL: this.ghlApiBaseUrl,
        headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            "Content-Type": "application/json",
        },
    });

    httpClient.interceptors.response.use((response) => response, async (error: AxiosError) => {
        // Error handling logic
        throw new HttpException((data as any)?.message || "API request failed", status || HttpStatus.INTERNAL_SERVER_ERROR);
    });
    return httpClient;
}
```

**Key Points:**
- Use `axios.create()` with baseURL and default headers
- Set up response interceptors for error handling
- Log errors comprehensively before throwing

### Logger Pattern

From `src/ghl/ghl.service.ts`:

```typescript
this.gaLogger.log(`Message sent to GHL for contact ${contactId}`);
this.gaLogger.error(`Failed to send: ${error.message}`, error.stack);
this.gaLogger.warn(`Skipping webhook: type ${webhook.typeWebhook}`);
this.gaLogger.info(`Processing message from ${logContext}`);
```

**Key Points:**
- Use NestJS Logger class for consistent logging
- Include context in log messages (instance names, IDs)
- Log at appropriate levels: log/info, warn, error

## Requirements

### Functional Requirements

1. **Constructor Initialization**
   - Description: Accept `baseUrl` and `apiKey` as constructor parameters, create axios instance with default headers
   - Acceptance: Client can be instantiated with Evolution API credentials

2. **Send Text Message (sendText)**
   - Description: POST to `/message/sendText/{instanceName}` with `{ number, text }` body
   - Acceptance: Returns response from Evolution API, errors are caught and logged

3. **Send Media Message (sendMedia)**
   - Description: POST to `/message/sendMedia/{instanceName}` with `{ number, mediatype, media, caption }` body
   - Acceptance: Supports optional caption and mediaType parameters

4. **Get Connection State (getConnectionState)**
   - Description: GET from `/instance/connectionState/{instanceName}`
   - Acceptance: Returns state object with 'open', 'close', or 'connecting' values

5. **Set Webhook Configuration (setWebhook)**
   - Description: POST to `/webhook/set/{instanceName}` with `{ url, events, webhook_by_events: true }`
   - Acceptance: Webhook configuration is set with `webhook_by_events: true` always enabled

6. **Fetch All Instances (fetchInstances)**
   - Description: GET from `/instance/fetchInstances`
   - Acceptance: Returns array of all available instances

### Non-Functional Requirements

1. **Authentication**
   - All requests must include `apikey: {apiKey}` header
   - Header must be set on axios instance creation

2. **Error Handling**
   - All API calls must be wrapped in try-catch
   - Errors must be logged with context (method name, instance name, error details)
   - Errors should be re-thrown or transformed to appropriate HTTP exceptions

3. **Logging**
   - Use NestJS Logger class
   - Log all API calls at info/log level
   - Log errors at error level with stack traces

### Edge Cases

1. **Network Timeout** - Handle with axios timeout configuration and meaningful error message
2. **Invalid API Key** - Log authentication failures clearly
3. **Instance Not Found** - Handle 404 responses gracefully
4. **Rate Limiting** - Log rate limit errors with retry guidance
5. **Malformed Response** - Validate response structure before returning

## Implementation Notes

### DO
- Follow the axios pattern in `src/ghl/ghl.service.ts` for HTTP client creation
- Use NestJS Logger for all logging (not console.log)
- Make the module exportable for use in other modules
- Use TypeScript interfaces for API response types
- Set default timeout on axios instance
- Include instance name in all log messages for debugging

### DON'T
- Don't hardcode base URL or API key (accept as constructor params)
- Don't use `console.log` - use NestJS Logger
- Don't forget the `apikey` header (note: lowercase, not `apiKey`)
- Don't modify existing GREEN-API integration files
- Don't create database models or migrations

## API Reference

### Evolution API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/message/sendText/{instance}` | Send text message |
| POST | `/message/sendMedia/{instance}` | Send media (image/video/audio/document) |
| GET | `/instance/connectionState/{instance}` | Get connection state |
| POST | `/webhook/set/{instance}` | Configure webhook URL and events |
| GET | `/instance/fetchInstances` | List all instances |

### Request Headers

```
apikey: {your-api-key}
Content-Type: application/json
```

### Response Types

```typescript
// Connection State Response
interface ConnectionStateResponse {
  state: 'open' | 'close' | 'connecting';
}

// Send Message Response
interface SendMessageResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: object;
  messageTimestamp: number;
  status: string;
}

// Instance Response
interface InstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
}
```

## Development Environment

### Start Services

```bash
# Install dependencies
npm install

# Start development server
npm run start

# Or start with watch mode
npm run start:dev
```

### Service URLs
- Main Service: http://localhost:3000

### Required Environment Variables
- `DATABASE_URL`: Database connection string
- `GHL_CLIENT_ID`: GoHighLevel OAuth client ID
- `GHL_CLIENT_SECRET`: GoHighLevel OAuth client secret
- `GHL_CONVERSATION_PROVIDER_ID`: GHL custom conversation provider ID
- `APP_URL`: Base URL of this application
- `GHL_SHARED_SECRET`: GHL webhook signature secret
- `GHL_WORKFLOW_TOKEN`: GHL workflow action token
- `GHL_APP_ID`: GHL application ID

### Evolution API Environment (for testing)
- `EVOLUTION_API_URL`: Base URL of Evolution API instance (e.g., `http://localhost:8080`)
- `EVOLUTION_API_KEY`: Global API key for Evolution API

## File Structure

```
src/
└── evolution/
    ├── evolution-api.client.ts   # HTTP client service
    └── evolution.module.ts        # NestJS module
```

## Success Criteria

The task is complete when:

1. [ ] `src/evolution/evolution-api.client.ts` exists with all 6 methods implemented
2. [ ] `src/evolution/evolution.module.ts` exists and exports `EvolutionApiClient`
3. [ ] All methods include proper error handling with try-catch blocks
4. [ ] All methods log operations using NestJS Logger
5. [ ] Axios instance is configured with `apikey` header
6. [ ] TypeScript compiles without errors (`npm run build`)
7. [ ] No console errors when importing the module
8. [ ] Existing tests still pass (if any exist)

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Client instantiation | `src/evolution/evolution-api.client.spec.ts` | Client creates axios instance with correct headers |
| sendText method | `src/evolution/evolution-api.client.spec.ts` | POST request sent to correct endpoint with body |
| sendMedia method | `src/evolution/evolution-api.client.spec.ts` | POST request includes mediatype, media, optional caption |
| getConnectionState method | `src/evolution/evolution-api.client.spec.ts` | GET request returns connection state |
| setWebhook method | `src/evolution/evolution-api.client.spec.ts` | POST request includes webhook_by_events: true |
| fetchInstances method | `src/evolution/evolution-api.client.spec.ts` | GET request to correct endpoint |
| Error handling | `src/evolution/evolution-api.client.spec.ts` | Errors are caught, logged, and re-thrown |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Module exports | evolution.module.ts | EvolutionApiClient is properly exported as provider |
| DI injection | app.module.ts (future) | Module can be imported and client injected |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Manual API test | 1. Instantiate client 2. Call sendText | Request sent with correct format |

### Code Quality Checks
| Check | Command | Expected |
|-------|---------|----------|
| TypeScript compilation | `npm run build` | No errors |
| Linting | `npm run lint` | No errors or warnings |
| Module structure | Manual review | Follows NestJS conventions |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] TypeScript compiles without errors
- [ ] Code follows NestJS patterns from existing codebase
- [ ] Logger used consistently (not console.log)
- [ ] All 6 methods implemented with correct signatures
- [ ] Error handling present in all methods
- [ ] apikey header correctly configured (lowercase)
- [ ] No regressions in existing functionality
- [ ] Module properly exports the client service
