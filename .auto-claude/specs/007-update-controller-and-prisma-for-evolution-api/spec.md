# Specification: Update Controller and Prisma Service for Evolution API

## Overview

This task refactors the GHL controller (`ghl.controller.ts`) and Prisma service (`prisma.service.ts`) to migrate from Green API to Evolution API instance management. The core change involves transitioning from BigInt `idInstance` to string-based `instanceName` identifiers throughout the codebase, removing Green API dependencies, and updating all method signatures and data transfer objects to align with Evolution API's architecture.

## Workflow Type

**Type**: feature

**Rationale**: This is a feature implementation that introduces new Evolution API integration patterns while removing legacy Green API dependencies. It modifies core data structures, method signatures, and identifier strategies across multiple files.

## Task Scope

### Services Involved
- **main** (primary) - NestJS backend service containing the GHL controller and Prisma data access layer

### This Task Will:
- [ ] Update `CreateInstanceDto` interface to use `instanceName`, `evolutionApiUrl`, `evolutionApiKey` instead of `instanceId`, `apiToken`
- [ ] Update `getInstances()` method to return `instanceName` and `evolutionApiUrl` instead of `idInstance`
- [ ] Update `createInstance()` method to call new Evolution API method with updated parameters
- [ ] Update `deleteInstance()` and `updateInstance()` to use string `instanceName` for lookups
- [ ] Update all Prisma service instance methods to use `instanceName: string` instead of `idInstance: BigInt`
- [ ] Remove `StorageProvider` interface dependency from `@green-api/greenapi-integration`
- [ ] Remove `GreenApiLogger` import and create local logger or use NestJS Logger
- [ ] Remove all BigInt conversions for instance lookups

### Out of Scope:
- Database schema migrations (schema.prisma changes)
- GHL OAuth flow modifications
- Webhook controller updates for Evolution API events
- GHL service Evolution API integration methods (those are separate tasks)
- User model methods in Prisma service (these remain unchanged)

## Service Context

### Main Service

**Tech Stack:**
- Language: TypeScript
- Framework: NestJS
- ORM: Prisma
- Database: MySQL
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
| `src/ghl/ghl.controller.ts` | main | Update DTOs, method signatures, remove BigInt conversions, update response mappings |
| `src/prisma/prisma.service.ts` | main | Remove StorageProvider interface, update all instance methods to use instanceName |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/ghl/ghl.service.ts` | Method signature patterns, error handling, logging patterns |
| `src/types.ts` | Interface definition patterns for DTOs |
| `prisma/schema.prisma` | Current database schema (note: not being modified, but shows current field structure) |

## Patterns to Follow

### Controller Method Pattern

From `src/ghl/ghl.controller.ts`:

```typescript
@Get(":locationId")
async getInstances(@Param("locationId") locationId: string, @Req() req: AuthReq) {
    if (req.locationId !== locationId) {
        throw new HttpException("Unauthorized", HttpStatus.FORBIDDEN);
    }
    // ... implementation
}
```

**Key Points:**
- Use guards for authorization checks
- Use HttpException for error responses
- Return structured responses with `success: true/false`

### Prisma Service Method Pattern

From `src/prisma/prisma.service.ts`:

```typescript
async getInstance(idInstance: number | bigint): Promise<(Instance & { user: User }) | null> {
    return this.instance.findUnique({
        where: {idInstance: BigInt(idInstance)},
        include: {user: true},
    });
}
```

**Key Points:**
- Include related models when needed (e.g., `include: {user: true}`)
- Return appropriate types with unions (e.g., `Instance & { user: User }`)
- Use Prisma's typed query methods

### Logger Pattern

Replace `GreenApiLogger` with NestJS built-in Logger:

```typescript
import { Logger } from "@nestjs/common";

@Controller("api/instances")
export class GhlController {
    private readonly logger = new Logger(GhlController.name);

    // Use: this.logger.log(), this.logger.error(), this.logger.warn()
}
```

## Requirements

### Functional Requirements

1. **Update CreateInstanceDto Interface**
   - Description: Change DTO structure from Green API to Evolution API parameters
   - Acceptance: DTO contains `locationId`, `instanceName`, `evolutionApiUrl`, `evolutionApiKey`, and optional `name`
   - Old fields `instanceId` and `apiToken` are removed

2. **Update getInstances() Response**
   - Description: Return Evolution API-compatible instance data
   - Acceptance: Response includes `instanceName` (not `idInstance`), `evolutionApiUrl`, and properly mapped state values (`open`/`close`/`connecting`)

3. **Update createInstance() Method**
   - Description: Create instances using Evolution API parameters
   - Acceptance: Calls `ghlService.createEvolutionInstanceForUser()` with `instanceName`, `evolutionApiUrl`, `evolutionApiKey`
   - Returns `instanceName` in response

4. **Update deleteInstance() Route Parameter**
   - Description: Accept `instanceName` string instead of BigInt `instanceId`
   - Acceptance: Route uses string parameter, lookup uses `instanceName`

5. **Update updateInstance() Route Parameter**
   - Description: Accept `instanceName` string instead of BigInt `instanceId`
   - Acceptance: Route uses string parameter, lookup uses `instanceName`

6. **Update Prisma getInstance()**
   - Description: Find instance by `instanceName` string
   - Acceptance: Signature is `getInstance(instanceName: string)`, no BigInt conversion

7. **Update Prisma removeInstance()**
   - Description: Delete instance by `instanceName` string
   - Acceptance: Signature is `removeInstance(instanceName: string)`, no BigInt conversion

8. **Update Prisma updateInstanceSettings()**
   - Description: Update settings by `instanceName` string
   - Acceptance: Signature is `updateInstanceSettings(instanceName: string, settings)`, no BigInt conversion

9. **Update Prisma updateInstanceState()**
   - Description: Update state by `instanceName` string
   - Acceptance: Signature is `updateInstanceState(instanceName: string, state)`, no BigInt conversion

10. **Update Prisma updateInstanceName()**
    - Description: Update display name by `instanceName` string
    - Acceptance: Signature is `updateInstanceName(instanceName: string, name)`, no BigInt conversion

11. **Remove Green API Dependencies**
    - Description: Remove all imports from `@green-api/greenapi-integration` in affected files
    - Acceptance: No imports from that package in `ghl.controller.ts` or `prisma.service.ts`

### Edge Cases

1. **Instance not found** - Return 404 with "Instance not found" message
2. **Unauthorized access** - Return 403 when `req.locationId` doesn't match instance's `userId`
3. **Invalid instance name format** - Validate instanceName is non-empty string
4. **Duplicate instance name** - Return 409 Conflict when creating with existing name
5. **Missing OAuth tokens** - Return 401 Unauthorized with re-auth message

## Implementation Notes

### DO
- Follow the NestJS Logger pattern for logging (replace `GreenApiLogger`)
- Keep error handling consistent with existing patterns (HttpException with proper status codes)
- Keep response structure consistent (`{ success: true, ... }`)
- Use the existing guard pattern (`GhlContextGuard`) for authorization
- Keep User model methods unchanged in Prisma service
- Ensure all Prisma lookups use `instanceName` field (will require schema to have this field)

### DON'T
- Don't modify the User model methods in Prisma service
- Don't remove error handling - maintain all existing error cases
- Don't change the route paths (keep `/api/instances/...`)
- Don't modify the OAuth flow
- Don't implement the actual Evolution API calls (that's in ghl.service.ts, separate task)

### State Mapping
Map Evolution API states to response:
- Evolution API: `open`, `close`, `connecting`
- These should be returned as-is (no mapping to old Green API states needed in controller)

## Development Environment

### Start Services

```bash
npm run start
```

### Service URLs
- Main Service: http://localhost:3000

### Required Environment Variables
- `DATABASE_URL`: MySQL connection string
- `GHL_CLIENT_ID`: GoHighLevel OAuth client ID
- `GHL_CLIENT_SECRET`: GoHighLevel OAuth client secret
- `GHL_CONVERSATION_PROVIDER_ID`: GHL conversation provider ID
- `APP_URL`: Base URL for this application
- `GHL_SHARED_SECRET`: Shared secret for GHL webhooks
- `GHL_WORKFLOW_TOKEN`: Token for workflow actions
- `GHL_APP_ID`: GoHighLevel app ID

## Success Criteria

The task is complete when:

1. [ ] `CreateInstanceDto` uses `instanceName`, `evolutionApiUrl`, `evolutionApiKey` instead of `instanceId`, `apiToken`
2. [ ] `getInstances()` returns `instanceName` and `evolutionApiUrl` in response
3. [ ] `createInstance()` uses new DTO fields and calls appropriate service method
4. [ ] `deleteInstance()` accepts and uses string `instanceName` parameter
5. [ ] `updateInstance()` accepts and uses string `instanceName` parameter
6. [ ] All Prisma instance methods use `instanceName: string` parameter
7. [ ] No BigInt conversions remain in controller or prisma service instance methods
8. [ ] No imports from `@green-api/greenapi-integration` in modified files
9. [ ] Application compiles without TypeScript errors
10. [ ] Existing functionality patterns preserved (auth guards, error handling)

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| CreateInstanceDto validation | `src/ghl/ghl.controller.ts` | DTO accepts new fields, rejects old fields |
| getInstance by instanceName | `src/prisma/prisma.service.ts` | Returns instance when found, null when not found |
| removeInstance by instanceName | `src/prisma/prisma.service.ts` | Deletes correct instance, throws on not found |
| updateInstanceSettings | `src/prisma/prisma.service.ts` | Updates settings for correct instance |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| GET /api/instances/:locationId | controller + prisma | Returns instances with instanceName, evolutionApiUrl |
| POST /api/instances | controller + prisma + service | Creates instance with new fields |
| DELETE /api/instances/:instanceName | controller + prisma | Deletes instance by instanceName |
| PATCH /api/instances/:instanceName | controller + prisma | Updates instance by instanceName |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Create Instance | 1. POST with instanceName, evolutionApiUrl, evolutionApiKey 2. GET instances | Instance appears in list with correct fields |
| Delete Instance | 1. Create instance 2. DELETE by instanceName 3. GET instances | Instance no longer in list |
| Update Instance | 1. Create instance 2. PATCH name 3. GET instances | Instance shows updated name |

### Code Verification
| Check | What to Verify | Expected |
|-------|----------------|----------|
| No BigInt usage | Search for `BigInt(` in modified files | No occurrences |
| No Green API imports | Check imports in modified files | No `@green-api/greenapi-integration` |
| TypeScript compilation | Run `npx tsc --noEmit` | No errors |
| All routes preserved | Check controller decorators | Same route paths as before |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Prisma generates | `npx prisma generate` | Completes without error |
| Types are correct | TypeScript checks | Instance type includes instanceName |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] TypeScript compilation succeeds
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns (error handling, response structure)
- [ ] No security vulnerabilities introduced
- [ ] No Green API dependencies remain in modified files
