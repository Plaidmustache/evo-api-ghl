# Codebase Structure

**Analysis Date:** 2025-01-17

## Directory Layout

```
evo-api-ghl/
├── src/                      # Application source code
│   ├── main.ts              # Application bootstrap
│   ├── app.module.ts        # Root module
│   ├── types.ts             # Shared TypeScript types
│   ├── custom-page/         # GHL iframe UI module
│   ├── evolution/           # Evolution API client module
│   ├── filters/             # Exception filters
│   ├── ghl/                 # GHL integration module (main business logic)
│   │   ├── dto/             # Data transfer objects
│   │   ├── guards/          # Authentication guards
│   │   └── types/           # GHL-specific type definitions
│   ├── oauth/               # OAuth flow module
│   │   └── dto/             # OAuth DTOs
│   ├── prisma/              # Database module
│   └── webhooks/            # Webhook handlers module
│       ├── dto/             # Webhook DTOs
│       └── guards/          # Webhook validation guards
├── prisma/                   # Prisma schema and migrations
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Migration files
├── dist/                     # Compiled JavaScript output
├── .planning/               # Planning documents
│   ├── codebase/            # Codebase analysis docs
│   └── research/            # Research notes
└── [config files]           # Root configuration files
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript application source code
- Contains: Modules, services, controllers, types
- Key files: `main.ts` (entry), `app.module.ts` (root module), `types.ts` (shared types)

**src/ghl/:**
- Purpose: Core business logic for GHL integration
- Contains: GhlService (main logic), GhlTransformer (message conversion), GhlController (instance API)
- Key files: `ghl.service.ts` (859 lines, main orchestration), `ghl.transformer.ts` (message conversion)

**src/webhooks/:**
- Purpose: Handle incoming webhooks from GHL and Evolution API
- Contains: WebhooksController, webhook guards, DTOs
- Key files: `webhooks.controller.ts` (routes), `guards/evolution-webhook.guard.ts` (validation)

**src/oauth/:**
- Purpose: GHL OAuth 2.0 authentication flow
- Contains: OauthController, OAuth DTOs
- Key files: `oauth.controller.ts` (token exchange, bulk installation)

**src/prisma/:**
- Purpose: Database access layer
- Contains: PrismaService extending PrismaClient with custom methods
- Key files: `prisma.service.ts` (all database operations)

**src/custom-page/:**
- Purpose: Serve embedded UI for GHL iframe
- Contains: CustomPageController with inline HTML/CSS/JS
- Key files: `custom-page.controller.ts` (serves management UI)

**src/evolution/:**
- Purpose: Evolution API client abstraction
- Contains: EvolutionApiClient class, API types
- Key files: `evolution-api.client.ts` (HTTP client), `evolution-api.types.ts`

**src/filters/:**
- Purpose: Global exception handling
- Contains: ValidationExceptionFilter
- Key files: `validation-exception.filter.ts`

**prisma/:**
- Purpose: Database schema and migrations
- Contains: Prisma schema, migration SQL files
- Key files: `schema.prisma` (3 models: User, Instance, SentMessage)

## Key File Locations

**Entry Points:**
- `src/main.ts`: Application bootstrap, middleware setup, server start
- `src/app.module.ts`: Root module importing all feature modules

**Configuration:**
- `package.json`: Dependencies, scripts (build, start, dev)
- `tsconfig.json`: TypeScript compiler options
- `nest-cli.json`: NestJS CLI configuration
- `.env`: Environment variables (DATABASE_URL, GHL_*, APP_URL)
- `.env.example`: Template for required environment variables

**Core Logic:**
- `src/ghl/ghl.service.ts`: Main business logic (message handling, OAuth, Evolution client)
- `src/ghl/ghl.transformer.ts`: Message format conversion (Evolution ↔ GHL)
- `src/prisma/prisma.service.ts`: All database operations

**API Routes:**
- `src/webhooks/webhooks.controller.ts`: `/webhooks/*` endpoints
- `src/oauth/oauth.controller.ts`: `/oauth/*` endpoints
- `src/ghl/ghl.controller.ts`: `/api/instances/*` endpoints
- `src/custom-page/custom-page.controller.ts`: `/app/*` endpoints

**Testing:**
- `src/ghl/ghl.transformer.spec.ts`: Unit tests for transformer

**Database:**
- `prisma/schema.prisma`: Models (User, Instance, SentMessage)
- `prisma/migrations/`: Migration history

## Naming Conventions

**Files:**
- `[name].module.ts`: NestJS module definitions
- `[name].controller.ts`: HTTP controllers
- `[name].service.ts`: Business logic services
- `[name].guard.ts`: Route guards
- `[name].filter.ts`: Exception filters
- `[name].dto.ts`: Data transfer objects
- `[name].types.ts`: Type definitions
- `[name].spec.ts`: Test files

**Directories:**
- Feature modules: lowercase singular (e.g., `ghl/`, `oauth/`, `webhooks/`)
- Sub-directories: lowercase plural (e.g., `dto/`, `guards/`, `types/`)

**Classes:**
- Controllers: `[Name]Controller` (e.g., `GhlController`)
- Services: `[Name]Service` (e.g., `GhlService`, `PrismaService`)
- Guards: `[Name]Guard` (e.g., `GhlContextGuard`, `EvolutionWebhookGuard`)
- Modules: `[Name]Module` (e.g., `GhlModule`, `WebhooksModule`)
- DTOs: `[Name]Dto` (e.g., `GhlWebhookDto`, `WorkflowActionDto`)

**Variables/Functions:**
- camelCase for variables and functions
- UPPER_SNAKE_CASE for constants (e.g., `ALLOWED_EVOLUTION_EVENTS`)

## Where to Add New Code

**New Feature Module:**
- Create directory: `src/[feature-name]/`
- Files needed:
  - `[feature-name].module.ts` - Module definition
  - `[feature-name].controller.ts` - HTTP endpoints (if needed)
  - `[feature-name].service.ts` - Business logic
- Register in `src/app.module.ts` imports array

**New Controller/Module:**
- Implementation: `src/[feature]/[name].controller.ts`
- Register in feature module's `controllers` array

**New Service:**
- Implementation: `src/[feature]/[name].service.ts`
- Add to feature module's `providers` and optionally `exports`

**New Guard:**
- Implementation: `src/[feature]/guards/[name].guard.ts`
- Use via `@UseGuards(GuardName)` decorator on controller or route

**New DTO:**
- Implementation: `src/[feature]/dto/[name].dto.ts`
- Use class-validator decorators for validation

**New Types:**
- Shared types: `src/types.ts`
- Feature-specific: `src/[feature]/types/[name].types.ts`

**Database Changes:**
- Edit schema: `prisma/schema.prisma`
- Generate migration: `npx prisma migrate dev --name [migration-name]`
- Add methods: `src/prisma/prisma.service.ts`

**New Tests:**
- Location: alongside source file as `[name].spec.ts`
- Example: `src/ghl/ghl.transformer.spec.ts`

**Utilities:**
- Helper functions: Add to relevant service or create `src/utils/` if shared

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**node_modules/:**
- Purpose: NPM dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**prisma/migrations/:**
- Purpose: Database migration history
- Generated: Yes (by `prisma migrate dev`)
- Committed: Yes (version controlled)

**.planning/:**
- Purpose: Project planning and analysis documents
- Generated: No (manually created)
- Committed: Yes (documentation)

---

*Structure analysis: 2025-01-17*
