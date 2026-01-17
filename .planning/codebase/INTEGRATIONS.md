# External Integrations

**Analysis Date:** 2026-01-17

## APIs & External Services

**Evolution API (WhatsApp Integration):**
- Purpose: WhatsApp messaging via self-hosted Evolution API server
- SDK/Client: Custom Axios client in `src/ghl/ghl.service.ts` (createEvolutionClient method)
- Standalone client class: `src/evolution/evolution-api.client.ts`
- Auth: Per-instance API key (stored in Instance model)
- Config: `EVOLUTION_API_URL` env var (default server URL)

**Evolution API Endpoints Used:**
- `POST /message/sendText/{instanceName}` - Send text messages
- `POST /message/sendMedia/{instanceName}` - Send media files
- `POST /message/sendButtons/{instanceName}` - Send interactive buttons
- `GET /instance/connectionState/{instanceName}` - Check connection status
- `POST /webhook/set/{instanceName}` - Configure webhooks

**GoHighLevel (GHL) API:**
- Purpose: CRM integration for contacts and conversations
- SDK/Client: Custom Axios client with OAuth tokens in `src/ghl/ghl.service.ts`
- Base URL: `https://services.leadconnectorhq.com`
- API Version: `2021-07-28`
- Auth: OAuth 2.0 Bearer tokens (per-location)

**GHL API Endpoints Used:**
- `POST /oauth/token` - OAuth token exchange and refresh
- `GET /oauth/installedLocations` - List installed locations (bulk install)
- `POST /oauth/locationToken` - Get location-specific tokens
- `POST /contacts/upsert` - Create/update contacts
- `GET /contacts/{id}` - Get contact by ID
- `GET /contacts/` - Search contacts
- `POST /conversations/` - Create conversations
- `POST /conversations/messages/inbound` - Send inbound messages
- `PUT /conversations/messages/{id}/status` - Update message status

## Data Storage

**Databases:**
- MySQL 8.0
  - Connection: `DATABASE_URL` env var
  - Client: Prisma ORM (`@prisma/client`)
  - Schema: `prisma/schema.prisma`

**Database Models:**
- `User` - GHL location credentials (OAuth tokens)
- `Instance` - Evolution API instance configurations
- `SentMessage` - Message ID mapping for read receipts

**File Storage:**
- None (media handled via URLs)

**Caching:**
- None (NestJS ConfigModule cache for env vars only)

## Authentication & Identity

**OAuth Provider:**
- GoHighLevel OAuth 2.0
  - Implementation: `src/oauth/oauth.controller.ts`
  - Flow: Authorization code grant
  - Supports: Single location and bulk (company-wide) installation
  - Token refresh: Automatic via `refreshUserTokens()` method

**Env vars:**
- `GHL_CLIENT_ID` - OAuth client ID
- `GHL_CLIENT_SECRET` - OAuth client secret

**Webhook Authentication:**
- Evolution API: Instance-specific webhook tokens (stored in Instance settings)
- GHL: Conversation provider ID verification
- Workflow actions: Bearer token via `GHL_WORKFLOW_TOKEN`

## Monitoring & Observability

**Error Tracking:**
- None configured (logging only)

**Logs:**
- NestJS Logger (console-based)
- Per-service loggers (GhlService, WebhooksController, etc.)

## CI/CD & Deployment

**Hosting:**
- Docker Compose (development and staging)
- Docker image: `node:20-alpine`

**CI Pipeline:**
- None configured

**Docker Compose Services:**
- `adapter` - Main application (port 3000)
- `db` - MySQL 8.0 database

## Environment Configuration

**Required env vars:**
```
DATABASE_URL              # MySQL connection string
EVOLUTION_API_URL         # Evolution API server URL
APP_URL                   # Public URL for webhooks
GHL_APP_ID                # GHL Marketplace App ID
GHL_CLIENT_ID             # GHL OAuth Client ID
GHL_CLIENT_SECRET         # GHL OAuth Client Secret
GHL_CONVERSATION_PROVIDER_ID  # GHL Conversation Provider ID
GHL_SHARED_SECRET         # Webhook verification secret
GHL_WORKFLOW_TOKEN        # Workflow action auth token
```

**Secrets location:**
- `.env` file (not committed)
- Docker Compose environment variables

## Webhooks & Callbacks

**Incoming:**
- `POST /webhooks/evolution` - Evolution API webhooks (messages, connection status)
  - Guard: `EvolutionWebhookGuard` (instance lookup by header token)
  - Events: MESSAGES_UPSERT, CONNECTION_UPDATE, MESSAGES_UPDATE
- `POST /webhooks/ghl` - GHL conversation provider webhooks
  - Validates: conversationProviderId matches config
  - Handles: OutboundMessage (GHL -> WhatsApp)
- `POST /webhooks/workflow-action` - GHL workflow action triggers
  - Guard: `WorkflowTokenGuard` (Bearer token)
- `GET /oauth/callback` - GHL OAuth callback

**Outgoing:**
- Evolution API webhook configuration (set per instance on creation)
  - URL: `{APP_URL}/webhooks/evolution`
  - Events: MESSAGES_UPSERT, CONNECTION_UPDATE, MESSAGES_UPDATE, CALL

## Integration Flow

**Inbound Message (WhatsApp -> GHL):**
1. Evolution API sends webhook to `/webhooks/evolution`
2. Guard identifies instance by webhook token
3. `handleMessagesUpsert()` extracts message content
4. Contact upserted in GHL via `/contacts/upsert`
5. Message sent to GHL conversation via `/conversations/messages/inbound`

**Outbound Message (GHL -> WhatsApp):**
1. GHL sends webhook to `/webhooks/ghl`
2. Active instance found for location
3. Message sent via Evolution API `/message/sendText`
4. Message ID stored in `SentMessage` for receipt tracking
5. Status updates sent back to GHL as Evolution reports delivery/read

## Rate Limiting

**Application:**
- NestJS Throttler: 100 requests per 60 seconds (global)

**External:**
- GHL API: Subject to GHL rate limits
- Evolution API: Subject to WhatsApp rate limits

---

*Integration audit: 2026-01-17*
