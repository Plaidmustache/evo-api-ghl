# Technology Stack

**Analysis Date:** 2026-01-17

## Languages

**Primary:**
- TypeScript 5.7.3 - All source code in `src/`

**Secondary:**
- SQL (via Prisma schema) - Database schema definition in `prisma/schema.prisma`

## Runtime

**Environment:**
- Node.js 20 (Alpine-based Docker image)
- Target: ES2023

**Package Manager:**
- npm (package-lock.json present)
- Lockfile: present

## Frameworks

**Core:**
- NestJS 11.0.1 - Primary application framework
  - `@nestjs/core` - Core framework
  - `@nestjs/common` - Common utilities and decorators
  - `@nestjs/platform-express` - Express HTTP adapter
  - `@nestjs/config` - Configuration management
  - `@nestjs/axios` - HTTP client integration
  - `@nestjs/throttler` - Rate limiting

**Testing:**
- `@nestjs/testing` 11.0.1 - NestJS testing utilities (no test runner configured)

**Build/Dev:**
- NestJS CLI 11.0.0 - Build and development tooling
- ts-node 10.9.2 - TypeScript execution
- ts-loader 9.5.2 - Webpack TypeScript loader

## Key Dependencies

**Critical:**
- `@prisma/client` 6.6.0 - Database ORM client
- `axios` (via @nestjs/axios 4.0.0) - HTTP client for Evolution API and GHL API calls
- `rxjs` 7.8.1 - Reactive extensions (NestJS dependency)

**Security:**
- `helmet` 8.1.0 - HTTP security headers
- `crypto-js` 4.2.0 - Cryptographic operations (webhook signature verification)

**Validation:**
- `class-validator` 0.14.2 - DTO validation decorators
- `class-transformer` 0.5.1 - Object transformation

**Infrastructure:**
- `prisma` 6.6.0 (dev) - Database schema management and migrations
- `prisma-json-types-generator` 3.4.1 (dev) - JSON type generation for Prisma

## Configuration

**Environment:**
- Configuration via `.env` file (loaded by `@nestjs/config`)
- Required environment variables:
  - `DATABASE_URL` - MySQL connection string
  - `EVOLUTION_API_URL` - Evolution API server URL
  - `APP_URL` - Public URL for webhook callbacks
  - `GHL_APP_ID` - GoHighLevel App ID
  - `GHL_CLIENT_ID` - GoHighLevel OAuth Client ID
  - `GHL_CLIENT_SECRET` - GoHighLevel OAuth Client Secret
  - `GHL_CONVERSATION_PROVIDER_ID` - GHL Conversation Provider ID
  - `GHL_SHARED_SECRET` - Shared secret for webhook verification
  - `GHL_WORKFLOW_TOKEN` - Token for workflow action authentication

**Build:**
- `nest-cli.json` - NestJS CLI configuration
- `tsconfig.json` - TypeScript compiler options
- `tsconfig.build.json` - Build-specific TypeScript options

**TypeScript Settings:**
- Module: CommonJS
- Target: ES2023
- Decorators: Enabled (emitDecoratorMetadata, experimentalDecorators)
- Strict null checks: Enabled
- Output: `./dist`

## Platform Requirements

**Development:**
- Node.js 20+
- MySQL 8.0+ (or compatible)
- npm

**Production:**
- Docker (Alpine-based)
- MySQL 8.0+
- Port 3000 exposed
- Prisma migrations run on startup

**Docker:**
- Base image: `node:20-alpine`
- Build: `npx prisma generate && npm run build`
- Start: `npx prisma migrate deploy && npm run start:prod`

## Scripts

```bash
npm run build        # Compile TypeScript via NestJS CLI
npm run start        # Start development server
npm run start:dev    # Start with watch mode
npm run start:debug  # Start with debug and watch
npm run start:prod   # Start production server (node dist/main)
```

---

*Stack analysis: 2026-01-17*
