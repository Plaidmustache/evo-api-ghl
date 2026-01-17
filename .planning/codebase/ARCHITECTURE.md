# Architecture

**Analysis Date:** 2025-01-17

## Pattern Overview

**Overall:** NestJS Modular Monolith with Message Bridge Pattern

**Key Characteristics:**
- Module-based organization following NestJS conventions
- Acts as a bidirectional message bridge between GoHighLevel (GHL) CRM and Evolution API (WhatsApp)
- Multi-tenant architecture: one app serves multiple GHL locations, each with multiple WhatsApp instances
- OAuth 2.0 integration with GHL for authentication
- Webhook-based event processing from both GHL and Evolution API

## Layers

**Controllers (HTTP Entry Points):**
- Purpose: Handle HTTP requests, validate inputs, delegate to services
- Location: `src/*/[name].controller.ts`
- Contains: Route handlers, DTO validation, response formatting
- Depends on: Services, Guards, DTOs
- Used by: External HTTP clients (GHL, Evolution API, browsers)

**Services (Business Logic):**
- Purpose: Core business logic, external API integration, data orchestration
- Location: `src/ghl/ghl.service.ts`, `src/prisma/prisma.service.ts`
- Contains: Message transformation, webhook handling, OAuth flow, Evolution API calls
- Depends on: PrismaService, ConfigService, Transformer
- Used by: Controllers

**Transformers (Message Conversion):**
- Purpose: Convert messages between GHL and Evolution API formats
- Location: `src/ghl/ghl.transformer.ts`
- Contains: Format conversion logic, message type handlers
- Depends on: Type definitions
- Used by: GhlService

**Guards (Authentication/Authorization):**
- Purpose: Validate requests before they reach controllers
- Location: `src/*/guards/*.guard.ts`
- Contains: Token validation, context extraction, webhook validation
- Depends on: ConfigService, PrismaService
- Used by: Controllers via @UseGuards decorator

**Data Access (Prisma ORM):**
- Purpose: Database operations, entity management
- Location: `src/prisma/prisma.service.ts`
- Contains: CRUD operations, query methods, relationship handling
- Depends on: Prisma Client, database schema
- Used by: Services, Guards

## Data Flow

**Inbound Message Flow (WhatsApp → GHL):**

1. Evolution API sends webhook to `/webhooks/evolution`
2. `EvolutionWebhookGuard` validates payload and attaches instance to request
3. `WebhooksController.handleEvolutionWebhook()` delegates to service
4. `GhlService.handleEvolutionWebhook()` processes by event type
5. For `MESSAGES_UPSERT`: extract message, upsert contact, send to GHL conversation
6. GHL API receives inbound message in the contact's conversation

**Outbound Message Flow (GHL → WhatsApp):**

1. GHL sends webhook to `/webhooks/ghl` when user sends message
2. `WebhooksController.handleGhlWebhook()` validates and finds active instance
3. `GhlService.handleGhlOutboundMessage()` formats and sends via Evolution API
4. Message ID mapping stored in `SentMessage` table for read receipts
5. Status update sent back to GHL marking message as "sent"

**OAuth Flow:**

1. User initiates OAuth from GHL marketplace
2. GHL redirects to `/oauth/callback` with authorization code
3. `GhlOauthController.callback()` exchanges code for tokens
4. Tokens stored in `User` table with expiration
5. Supports bulk installation for agencies with multiple locations

**Read Receipt Flow:**

1. Evolution API sends `MESSAGES_UPDATE` webhook with status change
2. `GhlService.handleMessagesUpdate()` looks up GHL message ID from `SentMessage`
3. Status mapped (READ → read, DELIVERY_ACK → delivered)
4. GHL API called to update message status

**State Management:**
- OAuth tokens stored in `User` model with automatic refresh
- Instance connection state tracked in `Instance.stateInstance` (open/close/connecting)
- Message mappings in `SentMessage` for read receipt correlation

## Key Abstractions

**Instance:**
- Purpose: Represents a WhatsApp connection via Evolution API
- Examples: `src/prisma/prisma.service.ts` (createInstance, getInstance)
- Pattern: Each GHL location can have multiple instances; one must be "open" to send messages

**User (GHL Location):**
- Purpose: Represents a GHL location with OAuth credentials
- Examples: `src/prisma/prisma.service.ts` (createUser, findUser)
- Pattern: Acts as tenant ID; all instances belong to a user

**Evolution API Client (Factory Pattern):**
- Purpose: HTTP client for Evolution API operations
- Examples: `src/ghl/ghl.service.ts` (createEvolutionClient)
- Pattern: Created dynamically per-instance with instance-specific credentials

**GHL API Client (Factory Pattern):**
- Purpose: Authenticated HTTP client for GHL API
- Examples: `src/ghl/ghl.service.ts` (createGhlClient, getValidGhlClient)
- Pattern: Created per-user with automatic token refresh

## Entry Points

**Main Bootstrap:**
- Location: `src/main.ts`
- Triggers: Application startup
- Responsibilities: Create NestJS app, configure middleware (helmet, validation), start server on port 3000

**Webhook Endpoints:**
- Location: `src/webhooks/webhooks.controller.ts`
- Triggers: External webhook calls from GHL and Evolution API
- Responsibilities:
  - `POST /webhooks/evolution` - Process Evolution API events
  - `POST /webhooks/ghl` - Process GHL outbound messages
  - `POST /webhooks/workflow-action` - Process GHL workflow triggers

**OAuth Endpoint:**
- Location: `src/oauth/oauth.controller.ts`
- Triggers: GHL OAuth redirect
- Responsibilities: Token exchange, user creation, bulk installation handling

**Instance Management API:**
- Location: `src/ghl/ghl.controller.ts`
- Triggers: Custom page UI requests
- Responsibilities:
  - `GET /api/instances/:locationId` - List instances
  - `POST /api/instances` - Create new instance
  - `DELETE /api/instances/:instanceId` - Remove instance
  - `PATCH /api/instances/:instanceId` - Update instance name

**Custom Page:**
- Location: `src/custom-page/custom-page.controller.ts`
- Triggers: GHL iframe loading
- Responsibilities:
  - `GET /app/whatsapp` - Serve management UI
  - `POST /app/decrypt-user-data` - Decrypt GHL user context

## Error Handling

**Strategy:** Exception filters with NestJS built-in patterns + graceful degradation for webhooks

**Patterns:**
- `ValidationExceptionFilter` catches `BadRequestException` and formats validation errors
- Webhook handlers respond 200 OK immediately, then process asynchronously to prevent retries
- Token refresh failures throw `HttpException` with UNAUTHORIZED status
- Evolution API client has Axios interceptor for error logging
- Guards throw `UnauthorizedException` for invalid requests

## Cross-Cutting Concerns

**Logging:**
- Built-in NestJS Logger with class-scoped context
- Each service/controller has `private readonly logger = new Logger(ClassName.name)`
- Logs include method, resource ID, error details

**Validation:**
- Global `ValidationPipe` with whitelist, transform, forbidNonWhitelisted
- DTOs use class-validator decorators (`@IsString`, `@IsNotEmpty`, etc.)
- Type guards for webhook data (`isMessagesUpsertData`, `isConnectionUpdateData`)

**Authentication:**
- `GhlContextGuard`: Decrypts encrypted user context from GHL iframe
- `EvolutionWebhookGuard`: Validates webhook payload and attaches instance
- `WorkflowTokenGuard`: Validates workflow action requests
- OAuth tokens refreshed automatically when expired

**Security:**
- Helmet middleware for HTTP security headers
- Rate limiting via @nestjs/throttler (100 requests per 60 seconds)
- Encrypted user context from GHL (AES encryption with shared secret)
- API keys stored in database per-instance

---

*Architecture analysis: 2025-01-17*
