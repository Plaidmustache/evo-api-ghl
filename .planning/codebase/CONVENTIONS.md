# Coding Conventions

**Analysis Date:** 2026-01-17

## Naming Patterns

**Files:**
- Controllers: `{feature}.controller.ts` (e.g., `ghl.controller.ts`)
- Services: `{feature}.service.ts` (e.g., `ghl.service.ts`)
- Modules: `{feature}.module.ts` (e.g., `ghl.module.ts`)
- DTOs: `{purpose}.dto.ts` (e.g., `ghl-webhook.dto.ts`, `workflow-action.dto.ts`)
- Guards: `{feature}.guard.ts` (e.g., `ghl-context.guard.ts`, `evolution-webhook.guard.ts`)
- Types: `{feature}.types.ts` (e.g., `evolution-webhook.types.ts`)
- Filters: `{purpose}-exception.filter.ts` (e.g., `validation-exception.filter.ts`)
- Transformers: `{feature}.transformer.ts` (e.g., `ghl.transformer.ts`)

**Functions:**
- camelCase for all function names
- Verbs first: `handleEvolutionWebhook()`, `createInstance()`, `getInstanceStatus()`
- Boolean checks: `isGroupMessage()`, `isMessagesUpsertData()`
- Transformers: `toPlatformMessage()`, `toEvolutionMessage()`
- Private methods: same naming, prefixed with `private` modifier

**Variables:**
- camelCase for variables and parameters
- UPPER_SNAKE_CASE for constants: `ALLOWED_EVOLUTION_EVENTS`
- Descriptive names: `evolutionMsgId`, `ghlMessageId`, `instanceWithUser`

**Types/Interfaces:**
- PascalCase for types and interfaces
- Prefix with feature name: `GhlWebhookDto`, `EvolutionMessage`, `EvolutionConnectionState`
- Response types: `{Feature}Response` (e.g., `GhlContactUpsertResponse`)
- Request types: `{Feature}Request` (e.g., `SendTextRequest`)
- Guard request types: `{Feature}Request` extending Express Request

**Classes:**
- PascalCase with descriptive names
- Suffix by purpose: `GhlService`, `GhlController`, `PrismaService`
- Guards: `{Feature}Guard` (e.g., `GhlContextGuard`, `EvolutionWebhookGuard`)

## Code Style

**Formatting:**
- Tabs for indentation (configured in tsconfig.json)
- Double quotes for imports and strings
- Semicolons required at statement ends
- Opening braces on same line as declaration

**TypeScript Configuration:**
- Target: ES2023
- Module: CommonJS
- strictNullChecks: enabled
- noImplicitAny: disabled (allows implicit any)
- experimentalDecorators: enabled
- emitDecoratorMetadata: enabled

**Linting:**
- No ESLint or Prettier configuration files detected
- Code style enforced by TypeScript compiler options

## Import Organization

**Order:**
1. External packages (NestJS, Express, third-party)
2. Relative imports from other modules
3. Relative imports from same module

**Example from `ghl.service.ts`:**
```typescript
// 1. NestJS core
import { Injectable, HttpException, HttpStatus, BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// 2. Third-party
import axios, { AxiosInstance, AxiosError } from "axios";

// 3. Local modules
import { GhlTransformer } from "./ghl.transformer";
import { PrismaService } from "../prisma/prisma.service";
import { GhlWebhookDto } from "./dto/ghl-webhook.dto";

// 4. Types
import type { Instance, User, InstanceState } from "@prisma/client";
```

**Path Aliases:**
- No path aliases configured
- Use relative paths: `../prisma/prisma.service`, `./dto/ghl-webhook.dto`

## Error Handling

**Patterns:**

1. **NestJS HTTP Exceptions:** Use built-in exception classes
```typescript
throw new HttpException("WhatsApp instance not connected", HttpStatus.SERVICE_UNAVAILABLE);
throw new BadRequestException("No phone number provided");
throw new NotFoundException("Location not found");
throw new UnauthorizedException("Invalid GHL context");
```

2. **Custom Error Codes:** Attach codes to errors for client identification
```typescript
const err = new Error("Invalid Evolution API credentials or instance not found");
(err as any).code = "INVALID_CREDENTIALS";
throw err;
```

3. **Try-Catch with Logging:** Log errors before re-throwing or handling
```typescript
try {
  await client.sendMessage({ chatId, message });
} catch (error) {
  this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
  throw new HttpException("Failed to send WhatsApp message", HttpStatus.INTERNAL_SERVER_ERROR);
}
```

4. **Guard-Level Validation:** Throw UnauthorizedException from guards
```typescript
if (!encryptedData) {
  throw new UnauthorizedException("No GHL context provided");
}
```

5. **Graceful Degradation:** For non-critical operations, log and continue
```typescript
// Status updates are best-effort
try {
  await ghlClient.put(`/conversations/messages/${messageId}/status`, { status });
} catch (error) {
  this.logger.warn(`Failed to mark message as sent: ${error.message}`);
  // Don't throw - let the operation continue
}
```

## Logging

**Framework:** NestJS Logger

**Instance Pattern:**
```typescript
private readonly logger = new Logger(GhlService.name);
```

**Log Levels:**
- `this.logger.log()`: Normal operations, successful actions
- `this.logger.debug()`: Detailed information for debugging
- `this.logger.warn()`: Non-critical issues, skipped operations
- `this.logger.error()`: Failures requiring attention

**When to Log:**
- Method entry for webhook handlers: `this.logger.log("Handling Evolution webhook: ${event}")`
- Successful API calls: `this.logger.log("Message sent to WhatsApp: ${chatId}")`
- Skipped operations: `this.logger.warn("Skipping workflow message with marker")`
- All errors before throwing: `this.logger.error("Failed to upsert contact: ${error.message}")`
- Debug for transformations: `this.logger.debug("Transforming Evolution webhook to GHL Platform Message")`

## Comments

**When to Comment:**
- Type definitions/interfaces: Brief purpose description
- Complex business logic: Explain the "why"
- Section markers: Separate logical groups in services
- JSDoc for public API methods

**JSDoc/TSDoc Pattern:**
```typescript
/**
 * Creates an Evolution API client for the given instance credentials
 */
private createEvolutionClient(instance: {...}): EvolutionClient {

/**
 * Handles incoming Evolution API v2 webhook
 */
async handleEvolutionWebhook(instance: Instance & { user: User }, webhook: EvolutionWebhook): Promise<void> {
```

**Section Markers:**
```typescript
// ============================================================================
// SentMessage Methods - For read receipt tracking
// ============================================================================
```

## Function Design

**Size:**
- Keep methods focused on single responsibility
- Long methods (50+ lines) are acceptable for complex transformations (e.g., `toPlatformMessage`)
- Extract helper functions for repeated logic

**Parameters:**
- Use object destructuring for complex parameters
- Type parameters inline or reference interfaces
```typescript
async createInstance(instanceData: {
  instanceName: string;
  evolutionApiUrl: string;
  ...
}): Promise<Instance>
```

**Return Values:**
- Use explicit return types
- Return interfaces/types, not raw objects
- Use Promise<T> for async methods
- Return null for "not found" cases, not undefined

**Async/Await:**
- Always use async/await for promises
- Mark all promise-returning functions as async

## Module Design

**Exports:**
- Services and transformers exported for cross-module use
- Types exported from dedicated type files

**Module Pattern:**
```typescript
@Module({
  imports: [EvolutionModule],
  providers: [GhlService, GhlTransformer],
  exports: [GhlService, GhlTransformer],
  controllers: [GhlController],
})
export class GhlModule {}
```

**Barrel Files:** Not used - import directly from source files

## Dependency Injection

**Pattern:** Constructor injection with readonly modifier
```typescript
constructor(
  private readonly ghlTransformer: GhlTransformer,
  private readonly prisma: PrismaService,
  private readonly configService: ConfigService,
) {}
```

## DTO Validation

**Decorators:** Use class-validator decorators
```typescript
@IsString()
@IsNotEmpty()
type: string;

@IsArray()
@IsString({each: true})
attachments: string[];

@IsString()
@IsOptional()
userId: string;
```

**Global Pipe Configuration:**
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,      // Strip unknown properties
  transform: true,      // Transform to DTO class
  forbidNonWhitelisted: true  // Reject unknown properties
}));
```

## Type Guards

**Pattern:** Use type guard functions for discriminated unions
```typescript
export function isMessagesUpsertData(data: EvolutionWebhookData): data is EvolutionMessagesUpsertData {
  return 'messages' in data || 'type' in data;
}

export function isConnectionUpdateData(data: EvolutionWebhookData): data is EvolutionConnectionUpdateData {
  return 'state' in data;
}
```

## HTTP Client Pattern

**Axios Usage:**
```typescript
private readonly httpClient: AxiosInstance;

constructor() {
  this.httpClient = axios.create({
    baseURL: this.baseUrl,
    headers: {
      "Content-Type": "application/json",
      "apikey": this.apiKey,
    },
  });
}
```

**Response Handling:**
```typescript
const { data } = await this.httpClient.post<ResponseType>(endpoint, payload);
return data;
```

---

*Convention analysis: 2026-01-17*
