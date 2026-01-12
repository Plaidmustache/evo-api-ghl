# Quick Spec: Update Prisma Schema for Evolution API

## Overview
Migrate database schema and types from GREEN-API to Evolution API authentication model.

## Workflow Type
simple

## Task Scope
- `prisma/schema.prisma` - Update Instance model and InstanceState enum
- `src/types.ts` - Add Evolution API webhook/message types

## Files to Modify
- `prisma/schema.prisma` - Update Instance model and InstanceState enum
- `src/types.ts` - Add Evolution API webhook/message types

## Change Details

### Schema Changes (prisma/schema.prisma)

**Instance model:**
- Remove: `idInstance BigInt @unique`
- Remove: `apiTokenInstance String`
- Add: `instanceName String @unique`
- Add: `evolutionApiUrl String`
- Add: `evolutionApiKey String`

**InstanceState enum:**
- Remove: `notAuthorized`, `authorized`, `yellowCard`, `blocked`, `starting`
- Add: `open`, `close`, `connecting`

### Type Additions (src/types.ts)

Add these Evolution API types:
```typescript
export type EvolutionConnectionState = 'open' | 'close' | 'connecting';

export interface EvolutionMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface EvolutionMessageData {
  key: EvolutionMessageKey;
  pushName: string;
  message: { conversation?: string; [key: string]: any };
  messageType: string;
  messageTimestamp: number;
}

export interface EvolutionWebhookPayload {
  event: 'messages.upsert' | 'connection.update' | string;
  instance: string;
  data: EvolutionMessageData | { state: EvolutionConnectionState };
}
```

## Success Criteria
- [ ] `npx prisma generate` runs without errors
- [ ] TypeScript compilation succeeds (`npx tsc --noEmit`)
- [ ] New types are properly exported from types.ts

## Notes
- This is a breaking change - all code referencing `idInstance`/`apiTokenInstance` will need updates in subsequent tasks
- Run `npx prisma generate` after schema changes to regenerate Prisma client
