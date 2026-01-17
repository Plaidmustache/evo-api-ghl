# Codebase Concerns

**Analysis Date:** 2026-01-17

## Tech Debt

**Monolithic Custom Page Controller:**
- Issue: Single file (`src/custom-page/custom-page.controller.ts`) contains 1194 lines, mixing backend controller logic with frontend HTML/CSS/JavaScript as a template literal string
- Files: `src/custom-page/custom-page.controller.ts`
- Impact: Extremely difficult to maintain, no syntax highlighting for embedded code, impossible to unit test frontend logic, violates separation of concerns
- Fix approach: Extract frontend into separate static files or a proper frontend build process; serve via NestJS static assets module

**OAuth Controller Inline HTML:**
- Issue: `oauth.controller.ts` (699 lines) returns large HTML strings inline for success/error pages
- Files: `src/oauth/oauth.controller.ts`
- Impact: Same maintainability issues as custom page controller, duplicated CSS across files
- Fix approach: Move HTML templates to separate template files, use a templating engine like Handlebars, or redirect to static pages

**Excessive Use of `any` Type:**
- Issue: 25+ occurrences of `any` type throughout codebase, undermining TypeScript safety
- Files: `src/ghl/ghl.service.ts`, `src/ghl/dto/workflow-action.dto.ts`, `src/ghl/ghl.transformer.ts`, `src/webhooks/webhooks.controller.ts`, `src/types.ts`
- Impact: Runtime type errors, reduced IDE support, harder refactoring
- Fix approach: Define proper interfaces for Evolution API responses, GHL webhook payloads, and DTO properties; use `unknown` with type guards where necessary

**EvolutionApiClient Class Not Used:**
- Issue: `src/evolution/evolution-api.client.ts` defines a clean `EvolutionApiClient` class but `GhlService` creates its own inline axios clients instead
- Files: `src/evolution/evolution-api.client.ts`, `src/ghl/ghl.service.ts`
- Impact: Duplicated HTTP client logic, inconsistent error handling
- Fix approach: Refactor `GhlService.createEvolutionClient()` to use `EvolutionApiClient` or consolidate to single implementation

## Known Bugs

**Console.error in Frontend Code:**
- Symptoms: Error logging in production frontend uses `console.error` which may leak to users
- Files: `src/custom-page/custom-page.controller.ts` (line 1026)
- Trigger: When instance loading fails in the custom page
- Workaround: None currently

## Security Considerations

**Overly Permissive CORS/CSP Headers:**
- Risk: Custom page sets `X-Frame-Options: ALLOWALL`, `Content-Security-Policy: frame-ancestors *`, and `Access-Control-Allow-Origin: *`
- Files: `src/custom-page/custom-page.controller.ts` (lines 18-22)
- Current mitigation: Required for GHL iframe embedding
- Recommendations: Restrict `frame-ancestors` to known GHL domains; use specific CORS origins if possible

**API Keys Stored in Database:**
- Risk: Evolution API keys stored in plaintext in `Instance.evolutionApiKey` field
- Files: `prisma/schema.prisma` (line 33), `src/ghl/ghl.service.ts`
- Current mitigation: Database access controls only
- Recommendations: Encrypt API keys at rest using application-level encryption

**No Rate Limiting on Webhook Endpoints:**
- Risk: Webhook endpoints can be flooded by malicious actors
- Files: `src/webhooks/webhooks.controller.ts`
- Current mitigation: `@nestjs/throttler` is in dependencies but not applied to webhook routes
- Recommendations: Apply rate limiting guards to all webhook endpoints

**Missing Webhook Signature Verification:**
- Risk: Evolution API webhooks not cryptographically verified; attackers can forge webhook calls
- Files: `src/webhooks/guards/evolution-webhook.guard.ts`
- Current mitigation: Instance name lookup only (attackable if instance names are guessable)
- Recommendations: Implement webhook token/signature verification using the stored `webhookToken`

## Performance Bottlenecks

**SentMessage Table Growth:**
- Problem: `SentMessage` table grows with every outbound message, no automatic cleanup
- Files: `src/prisma/prisma.service.ts` (line 201 has cleanup method but it's never called)
- Cause: `cleanupOldSentMessages()` method exists but is not scheduled
- Improvement path: Add NestJS cron job to call `cleanupOldSentMessages()` daily; add database index optimization

**No Connection Pooling Configuration:**
- Problem: Prisma client uses default connection pool settings
- Files: `prisma/schema.prisma`, `src/prisma/prisma.service.ts`
- Cause: No explicit pool configuration in datasource
- Improvement path: Configure `connection_limit` in DATABASE_URL or use Prisma Data Proxy for serverless

**Sequential Bulk Installation Processing:**
- Problem: Bulk installation processes locations one-by-one in a loop
- Files: `src/oauth/oauth.controller.ts` (line 256)
- Cause: Sequential `for` loop with `await` inside
- Improvement path: Use `Promise.all` with concurrency limiting for parallel processing

## Fragile Areas

**Message Type Detection:**
- Files: `src/ghl/ghl.service.ts` (lines 527-576), `src/ghl/ghl.transformer.ts`
- Why fragile: Relies on checking specific properties of Evolution API message objects; any API changes break parsing silently
- Safe modification: Add comprehensive tests for each message type, add logging for unknown message structures
- Test coverage: Single test file `src/ghl/ghl.transformer.spec.ts` covers basic cases only

**GHL Webhook Processing:**
- Files: `src/webhooks/webhooks.controller.ts` (lines 104-163)
- Why fragile: Multiple conditional branches, early returns that silently succeed, mixing response sending with business logic
- Safe modification: Extract webhook processing logic to dedicated service; add integration tests
- Test coverage: No tests for webhook controller

**Instance State Management:**
- Files: `src/ghl/ghl.service.ts` (lines 79-94, 416-424)
- Why fragile: State mapping uses hardcoded string comparisons; Evolution API may return unexpected states
- Safe modification: Add exhaustive enum mapping with fallback logging
- Test coverage: No tests for state management

## Scaling Limits

**Single Active Instance Selection:**
- Current capacity: Each location can have multiple instances but only uses "first" one
- Limit: No instance selection logic for multi-instance scenarios
- Scaling path: Implement instance selection strategy (round-robin, primary/backup, or user-selected)

**Webhook Processing Synchronicity:**
- Current capacity: Webhooks processed synchronously per request
- Limit: High webhook volume causes request timeouts
- Scaling path: Queue webhooks to background jobs using Bull/BullMQ; respond immediately with 200

## Dependencies at Risk

**No Test Framework Configured:**
- Risk: Jest/Vitest not in dependencies; existing `*.spec.ts` file exists but no test runner configured
- Impact: Cannot run or add tests, quality assurance blocked
- Migration plan: Add Jest with `@nestjs/testing`; configure in package.json

**Outdated Helmet Usage:**
- Risk: Helmet v8 installed but may not be configured correctly for NestJS 11
- Impact: Security headers may not be applied
- Migration plan: Verify Helmet middleware is properly registered in `main.ts`

## Missing Critical Features

**No Health Check Endpoint:**
- Problem: No `/health` or `/ready` endpoint for container orchestration
- Blocks: Kubernetes/Docker health probes, load balancer checks

**No Logging Infrastructure:**
- Problem: Uses only NestJS built-in Logger (console output)
- Blocks: Log aggregation, structured logging, error tracking

**No Scheduled Tasks:**
- Problem: `cleanupOldSentMessages` exists but never runs; no task scheduler
- Blocks: Automatic maintenance, stale data cleanup

**No Retry Logic for External APIs:**
- Problem: GHL and Evolution API calls fail permanently on first error
- Blocks: Resilience to transient network failures

## Test Coverage Gaps

**No Controller Tests:**
- What's not tested: All controllers (`oauth.controller.ts`, `ghl.controller.ts`, `webhooks.controller.ts`, `custom-page.controller.ts`)
- Files: `src/**/*.controller.ts`
- Risk: API contract changes, route handling errors go unnoticed
- Priority: High

**No Service Tests:**
- What's not tested: `GhlService` business logic (859 lines of untested code)
- Files: `src/ghl/ghl.service.ts`
- Risk: Critical message routing and API integration bugs
- Priority: High

**No Guard Tests:**
- What's not tested: `GhlContextGuard`, `EvolutionWebhookGuard`, `WorkflowTokenGuard`
- Files: `src/ghl/guards/*.ts`, `src/webhooks/guards/*.ts`
- Risk: Authentication bypasses, authorization failures
- Priority: High

**No Integration Tests:**
- What's not tested: End-to-end webhook flows, OAuth flows
- Files: None exist
- Risk: System-level regressions when components change
- Priority: Medium

**Only Transformer Has Tests:**
- What IS tested: `GhlTransformer` class
- Files: `src/ghl/ghl.transformer.spec.ts` (435 lines)
- Coverage: Good coverage for message transformation logic
- Priority: Maintain and expand

---

*Concerns audit: 2026-01-17*
