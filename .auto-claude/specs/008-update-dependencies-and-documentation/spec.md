# Specification: Update Dependencies and Documentation for Evolution API Migration

## Overview

This task completes the migration from GREEN-API to Evolution API by cleaning up package dependencies, rebranding project metadata, and comprehensively updating all documentation. The project currently contains numerous references to "GREEN-API" throughout its package.json, README files, source code comments, and configuration files that must be replaced with "Evolution API" branding to reflect the new self-hosted WhatsApp API backend.

## Workflow Type

**Type**: feature

**Rationale**: This is a feature workflow because it represents a complete rebranding effort as part of the Evolution API migration. While the code functionality has been updated in previous tasks, this task completes the migration by updating the public-facing aspects (package metadata, documentation, and any lingering code references).

## Task Scope

### Services Involved
- **main** (primary) - The NestJS adapter service that needs dependency cleanup and documentation updates

### This Task Will:
- [ ] Remove `@green-api/greenapi-integration` npm dependency from package.json
- [ ] Update package.json metadata (name, description, author, repository)
- [ ] Rewrite README.md with Evolution API branding and self-hosting instructions
- [ ] Update .env.example with any necessary changes
- [ ] Search and replace all remaining GREEN-API references in source code and comments
- [ ] Update any guard files, controllers, or services with GREEN-API naming

### Out of Scope:
- Core functionality changes (already done in previous tasks)
- Database schema changes (done in earlier tasks)
- Adding new features beyond documentation
- Changing the GoHighLevel integration patterns

## Service Context

### Main Service

**Tech Stack:**
- Language: TypeScript
- Framework: NestJS
- ORM: Prisma
- Key directories: `src/`

**Entry Point:** `src/main.ts`

**How to Run:**
```bash
npm run start        # Production
npm run start:dev    # Development with watch
```

**Port:** 3000

**Build Command:**
```bash
npm run build
```

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `package.json` | main | Remove @green-api/greenapi-integration, update name/description/author |
| `README.md` | main | Complete rewrite with Evolution API branding and self-hosting instructions |
| `README.ru.md` | main | Complete rewrite (Russian version) with Evolution API branding |
| `.env.example` | main | Update any GREEN-API specific comments |
| `src/webhooks/guards/greenapi-webhook.guard.ts` | main | Rename file and update class name to evolution-webhook.guard.ts |
| `src/webhooks/webhooks.module.ts` | main | Update import for renamed guard |
| `src/main.ts` | main | Remove any GREEN-API comments/references |
| `src/prisma/prisma.service.ts` | main | Update any GREEN-API comments |
| `src/oauth/oauth.controller.ts` | main | Update any GREEN-API comments |
| `src/webhooks/webhooks.controller.ts` | main | Update any GREEN-API comments |
| `src/ghl/ghl.service.ts` | main | Update any GREEN-API comments |
| `src/ghl/ghl.transformer.ts` | main | Update any GREEN-API comments |
| `src/custom-page/custom-page.controller.ts` | main | Update any GREEN-API comments |
| `src/filters/validation-exception.filter.ts` | main | Update any GREEN-API comments |
| `src/ghl/ghl.controller.ts` | main | Update any GREEN-API comments |
| `CLAUDE.md` | main | Update any GREEN-API references |
| `package-lock.json` | main | Auto-regenerated after npm install |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `CLAUDE.md` | Project overview explaining Evolution API architecture |
| Current `README.md` | Structure and sections to preserve (just rebrand) |
| `.env.example` | Environment variable documentation format |

## Patterns to Follow

### Package.json Metadata Pattern

The package.json should follow standard npm package conventions:

```json
{
  "name": "evolution-api-gohighlevel",
  "version": "1.2.3",
  "description": "Evolution API Integration with GoHighLevel",
  "author": "Your Name/Org",
  "private": false,
  "license": "MIT"
}
```

**Key Points:**
- Use lowercase kebab-case for package name
- Description should clearly state what the package does
- Keep version number unchanged (semantic versioning)

### README Documentation Pattern

The README should clearly communicate:
1. What the project does (Evolution API + GHL integration)
2. That Evolution API is self-hosted (users provide their own instance)
3. Setup instructions for both Evolution API and GoHighLevel
4. Environment variable documentation
5. Docker deployment instructions

### Environment Variable Documentation

Follow existing .env.example format:
```env
VARIABLE_NAME="placeholder_value"
```

## Requirements

### Functional Requirements

1. **Remove GREEN-API Dependency**
   - Description: Remove `@green-api/greenapi-integration` from package.json dependencies
   - Acceptance: Package installs successfully without the dependency; no runtime errors

2. **Update Package Metadata**
   - Description: Change name to `evolution-api-gohighlevel`, update description and author
   - Acceptance: `npm pack` shows correct package name; package.json reflects new branding

3. **Rebrand README**
   - Description: Replace all GREEN-API references with Evolution API, add self-hosting section
   - Acceptance: No mentions of "GREEN-API", "green-api", or "greenapi" in README.md

4. **Update Source Code References**
   - Description: Rename greenapi-webhook.guard.ts and update all GREEN-API comments/names
   - Acceptance: `grep -ri "green" --include="*.ts" src/` returns no results related to GREEN-API

5. **Update .env.example**
   - Description: Ensure example reflects Evolution API configuration
   - Acceptance: Variables documented match actual required configuration

### Edge Cases

1. **Package-lock.json regeneration** - Run `npm install` after package.json changes to regenerate
2. **Russian README (README.ru.md)** - Don't forget to update the Russian version as well
3. **File renames with git** - Use `git mv` for guard file rename to preserve history
4. **Import paths** - When renaming guard file, update all import statements

## Implementation Notes

### DO
- Use case-insensitive search to find all GREEN-API variants
- Run `npm install` after modifying package.json to regenerate package-lock.json
- Use `git mv` for file renames to preserve git history
- Update both README.md and README.ru.md
- Add a section explaining users need their own Evolution API instance
- Document required environment variables clearly

### DON'T
- Remove existing dependencies that are still needed (axios, NestJS, Prisma, etc.)
- Change version numbers in package.json
- Modify core functionality or business logic
- Add emojis to documentation (unless already present)
- Create new documentation files beyond updating existing ones

## Development Environment

### Start Services

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# Start in development mode
npm run start:dev

# Or start in production mode
npm run build && npm run start:prod
```

### Service URLs
- Main Service: http://localhost:3000

### Required Environment Variables
- `DATABASE_URL`: MySQL connection string (mysql://user:pass@host:port/dbname)
- `APP_URL`: Public URL where adapter is deployed (for webhooks)
- `GHL_CLIENT_ID`: GoHighLevel OAuth client ID
- `GHL_CLIENT_SECRET`: GoHighLevel OAuth client secret
- `GHL_CONVERSATION_PROVIDER_ID`: GoHighLevel conversation provider ID
- `GHL_SHARED_SECRET`: GoHighLevel shared secret for webhook verification
- `GHL_WORKFLOW_TOKEN`: GoHighLevel workflow token
- `GHL_APP_ID`: GoHighLevel app ID

## Success Criteria

The task is complete when:

1. [ ] `@green-api/greenapi-integration` dependency removed from package.json
2. [ ] Package name changed to `evolution-api-gohighlevel`
3. [ ] Package description updated to "Evolution API Integration with GoHighLevel"
4. [ ] README.md completely rebranded with Evolution API
5. [ ] README.ru.md completely rebranded with Evolution API
6. [ ] greenapi-webhook.guard.ts renamed to evolution-webhook.guard.ts
7. [ ] All import statements updated for renamed guard
8. [ ] `grep -ri "green" src/` returns no GREEN-API related results
9. [ ] `npm install` completes without errors
10. [ ] `npm run build` completes without errors
11. [ ] Application starts successfully with `npm run start`

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Automated Verification Tests
| Test | Command | Expected Outcome |
|------|---------|------------------|
| No GREEN-API in package.json name | `grep '"name":' package.json` | Contains "evolution-api-gohighlevel" |
| No GREEN-API dependency | `grep '@green-api' package.json` | No matches found |
| No GREEN-API in src/ | `grep -ri 'green' src/ \| grep -i api` | No GREEN-API references (may have other "green" words) |
| No GREEN-API in README | `grep -i 'green-api' README.md` | No matches found |
| NPM install works | `npm install` | Exit code 0 |
| Build succeeds | `npm run build` | Exit code 0 |

### File Verification
| File | Check | Expected |
|------|-------|----------|
| `package.json` | name field | "evolution-api-gohighlevel" |
| `package.json` | description field | "Evolution API Integration with GoHighLevel" |
| `package.json` | no @green-api dependency | Dependency removed |
| `README.md` | Title | Contains "Evolution API" |
| `README.md` | Self-hosting section | Present with instructions |
| `README.ru.md` | Title | Contains "Evolution API" (Russian version) |
| `src/webhooks/guards/` | Guard file | evolution-webhook.guard.ts exists |
| `.env.example` | Variables | All required vars documented |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Application Startup | main | App starts without import errors after guard rename |
| Build Process | main | TypeScript compilation succeeds |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Full Build | 1. npm install 2. npm run build 3. npm run start | Application starts, no errors |
| Documentation Review | 1. Read README.md 2. Check all links 3. Verify instructions | All references to Evolution API, no GREEN-API |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| No schema changes | `npx prisma migrate status` | No pending migrations |

### QA Sign-off Requirements
- [ ] All automated verification tests pass
- [ ] All file verifications complete
- [ ] npm install completes without errors
- [ ] npm run build completes without errors
- [ ] Application starts successfully
- [ ] No console errors mentioning GREEN-API
- [ ] No import errors from renamed files
- [ ] README clearly explains Evolution API self-hosting requirement
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced

## Additional Notes

### Evolution API Self-Hosting Section for README

The new README should include a section explaining:
- Evolution API is a free, self-hosted WhatsApp API
- Users must set up their own Evolution API instance
- Link to Evolution API documentation (https://doc.evolution-api.com/)
- The adapter connects GHL to the user's Evolution API instance

### Files That May Have GREEN-API References (from grep)

Main codebase files to check:
- `src/main.ts`
- `src/oauth/oauth.controller.ts`
- `src/prisma/prisma.service.ts`
- `src/webhooks/guards/greenapi-webhook.guard.ts`
- `src/webhooks/webhooks.controller.ts`
- `src/webhooks/webhooks.module.ts`
- `src/ghl/ghl.transformer.ts`
- `src/ghl/ghl.service.ts`
- `src/custom-page/custom-page.controller.ts`
- `src/filters/validation-exception.filter.ts`
- `src/ghl/ghl.controller.ts`
- `package.json`
- `README.md`
- `README.ru.md`
- `CLAUDE.md`
