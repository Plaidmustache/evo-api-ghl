# Testing Patterns

**Analysis Date:** 2026-01-17

## Test Framework

**Runner:**
- NestJS Testing Module (`@nestjs/testing`) v11.0.1
- Configured via NestJS CLI (no separate jest.config.js detected)

**Assertion Library:**
- Jest (bundled with NestJS CLI)

**Run Commands:**
```bash
# No test scripts defined in package.json
# Standard NestJS test commands would be:
nest test              # Run all tests (if configured)
nest test --watch      # Watch mode
nest test --coverage   # Coverage report
```

**Note:** package.json lacks test scripts - tests exist but may require manual Jest configuration.

## Test File Organization

**Location:**
- Co-located with source files (same directory)

**Naming:**
- Pattern: `{feature}.{component}.spec.ts`
- Example: `src/ghl/ghl.transformer.spec.ts`

**Structure:**
```
src/
  ghl/
    ghl.transformer.ts
    ghl.transformer.spec.ts  # Test co-located with source
```

## Test Structure

**Suite Organization:**
```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { GhlTransformer } from "./ghl.transformer";
import { EvolutionWebhook } from "./types/evolution-webhook.types";
import { GhlWebhookDto } from "./dto/ghl-webhook.dto";

describe("GhlTransformer", () => {
  let transformer: GhlTransformer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GhlTransformer],
    }).compile();

    transformer = module.get<GhlTransformer>(GhlTransformer);
  });

  describe("extractPhoneFromJid", () => {
    it("should strip @s.whatsapp.net suffix", () => {
      const result = transformer.extractPhoneFromJid("5511999999999@s.whatsapp.net");
      expect(result).toBe("5511999999999");
    });
  });
});
```

**Patterns:**
- Use `beforeEach` for fresh module instance per test
- Group related tests with nested `describe` blocks
- Use descriptive `it` statements: `it("should parse conversation message type", () => {})`

## Test Data Factories

**Helper Functions:** Create factory functions for test data
```typescript
const createEvolutionWebhook = (
  messageType: string,
  message: object,
  overrides: Partial<EvolutionWebhook["data"]> = {},
): EvolutionWebhook => ({
  event: "messages.upsert",
  instance: "test-instance",
  data: {
    key: {
      remoteJid: "5511999999999@s.whatsapp.net",
      fromMe: false,
      id: "MSG123",
    },
    pushName: "John Doe",
    message,
    messageType: messageType as any,
    messageTimestamp: 1704067200,
    ...overrides,
  },
});
```

**Usage:**
```typescript
it("should parse conversation message type", () => {
  const webhook = createEvolutionWebhook("conversation", {
    conversation: "Hello, this is a test message!",
  });

  const result = transformer.toPlatformMessage(webhook);

  expect(result.message).toBe("Hello, this is a test message!");
});
```

## Mocking

**Framework:** Jest built-in mocking

**Module Mocking Pattern:** NestJS Testing Module
```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [GhlTransformer],
}).compile();
```

**What to Mock:**
- External services (PrismaService, ConfigService)
- HTTP clients (axios)
- Third-party integrations

**What NOT to Mock:**
- Pure transformers (test actual logic)
- Type guards
- Utility functions

## Fixture Patterns

**Inline Test Data:**
```typescript
const ghlWebhook: GhlWebhookDto = {
  type: "SMS",
  phone: "+1-555-123-4567",
  message: "Hello from GHL!",
  locationId: "loc123",
};
```

**Parameterized Tests:**
```typescript
it("should detect image mediatype from URL extension", () => {
  const extensions = ["jpg", "jpeg", "png", "gif", "webp"];

  for (const ext of extensions) {
    const ghlWebhook: GhlWebhookDto = {
      type: "SMS",
      phone: "5511999999999",
      attachments: [`https://example.com/file.${ext}`],
      locationId: "loc123",
    };

    const result = transformer.toEvolutionMessage(ghlWebhook);
    expect((result as any).mediatype).toBe("image");
  }
});
```

**Location:**
- Inline in test files (no separate fixtures directory)

## Coverage

**Requirements:** Not enforced (no coverage configuration detected)

**View Coverage:**
```bash
# Would require Jest config:
npm test -- --coverage
```

## Test Types

**Unit Tests:**
- Focus: Transformer logic, type guards, utility functions
- Scope: Single class/function in isolation
- Location: `src/ghl/ghl.transformer.spec.ts`

**Integration Tests:**
- Not detected in codebase
- Would test: Controller + Service + Database

**E2E Tests:**
- Not configured
- NestJS supports via `@nestjs/testing` supertest integration

## Common Patterns

**Async Testing:**
```typescript
beforeEach(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [GhlTransformer],
  }).compile();

  transformer = module.get<GhlTransformer>(GhlTransformer);
});
```

**Error Testing:**
```typescript
it("should throw error for non-SMS webhook type", () => {
  const ghlWebhook: GhlWebhookDto = {
    type: "Email",
    phone: "5511999999999",
    message: "Hello",
    locationId: "loc123",
  };

  expect(() => transformer.toEvolutionMessage(ghlWebhook)).toThrow(
    "Unsupported GHL webhook for Evolution API",
  );
});
```

**Null/Undefined Handling:**
```typescript
it("should return empty string for null input", () => {
  const result = transformer.extractPhoneFromJid(null as unknown as string);
  expect(result).toBe("");
});

it("should return empty string for undefined input", () => {
  const result = transformer.extractPhoneFromJid(undefined as unknown as string);
  expect(result).toBe("");
});
```

**Property Assertions:**
```typescript
it("should extract image URL and caption", () => {
  const webhook = createEvolutionWebhook("imageMessage", {
    imageMessage: {
      url: "https://example.com/image.jpg",
      mimetype: "image/jpeg",
      caption: "Check out this image!",
    },
  });

  const result = transformer.toPlatformMessage(webhook);

  expect(result.message).toBe("Check out this image!");
  expect(result.attachments).toHaveLength(1);
  expect(result.attachments![0].url).toBe("https://example.com/image.jpg");
  expect(result.attachments![0].type).toBe("image/jpeg");
});
```

## Test Coverage Gaps

**Untested Areas:**
- `GhlService` - Main service with API integrations
- `PrismaService` - Database operations
- Controllers (`GhlController`, `WebhooksController`, `OauthController`)
- Guards (`GhlContextGuard`, `EvolutionWebhookGuard`, `WorkflowTokenGuard`)
- `ValidationExceptionFilter`
- `EvolutionApiClient` class

**What's Tested:**
- `GhlTransformer.toPlatformMessage()` - Message type transformations
- `GhlTransformer.toEvolutionMessage()` - GHL to Evolution transformations
- `GhlTransformer.extractPhoneFromJid()` - Phone extraction
- `GhlTransformer.isGroupMessage()` - Group detection

**Risk:**
- Service layer untested - webhook handling, OAuth flow, message sending
- Database operations untested - user/instance CRUD
- API integrations untested - GHL and Evolution API calls

**Priority:** High - Critical paths lack test coverage

## Recommended Test Additions

**High Priority:**
1. `GhlService` integration tests with mocked Prisma and HTTP clients
2. Guard tests with mocked request/context
3. Controller tests with mocked services

**Medium Priority:**
1. `PrismaService` integration tests with test database
2. `ValidationExceptionFilter` tests
3. E2E tests for OAuth callback flow

**Test Structure to Add:**
```typescript
// src/ghl/ghl.service.spec.ts
describe("GhlService", () => {
  let service: GhlService;
  let prisma: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GhlService,
        GhlTransformer,
        {
          provide: PrismaService,
          useValue: {
            findUser: jest.fn(),
            createInstance: jest.fn(),
            // ... other methods
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GhlService>(GhlService);
    prisma = module.get(PrismaService);
    configService = module.get(ConfigService);
  });

  describe("handleEvolutionWebhook", () => {
    it("should process MESSAGES_UPSERT event", async () => {
      // Test implementation
    });
  });
});
```

---

*Testing analysis: 2026-01-17*
