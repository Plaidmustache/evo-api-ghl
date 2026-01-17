# Requirements: evo-api-ghl Bug Fixes

**Defined:** 2025-01-17
**Core Value:** Every patient message reaches the practice, and practitioners see real delivery/read status

## v1 Requirements

Requirements for this bug fix release. Each maps to roadmap phases.

### @lid Identifier Handling

- [ ] **LID-01**: Create jid.utils.ts with phone extraction utilities
- [ ] **LID-02**: Update ghl.service.ts to use `split('@')[0]` for all phone extraction
- [ ] **LID-03**: Update ghl.transformer.ts to detect and log @lid identifiers
- [ ] **LID-04**: All JID formats handled uniformly (@lid, @c.us, @g.us, @s.whatsapp.net)

### Message Status Tracking

- [ ] **STATUS-01**: Add MessageMapping model to Prisma schema
- [ ] **STATUS-02**: Add Instance relation to MessageMapping
- [ ] **STATUS-03**: Run Prisma migration to create table
- [ ] **STATUS-04**: Add createMessageMapping method to PrismaService
- [ ] **STATUS-05**: Add findMessageMappingByEvolutionId method to PrismaService
- [ ] **STATUS-06**: Add updateMessageMappingStatus method to PrismaService
- [ ] **STATUS-07**: Store message mapping after Evolution API send
- [ ] **STATUS-08**: Add MESSAGES_UPDATE to allowed webhook types
- [ ] **STATUS-09**: Add handleOutgoingMessageStatus method to GhlService
- [ ] **STATUS-10**: Add mapEvolutionToGhlStatus helper method
- [ ] **STATUS-11**: Update GHL message status via real webhook data
- [ ] **STATUS-12**: Remove hardcoded "delivered" status after send
- [ ] **STATUS-13**: Remove setTimeout fake delivery (if present)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced @lid Support

- **LID-V2-01**: Persistent LID-to-phone mapping table (like WAHA)
- **LID-V2-02**: API endpoint for LID lookups
- **LID-V2-03**: Message deduplication across JID formats

### Status Enhancements

- **STATUS-V2-01**: Failed message retry logic
- **STATUS-V2-02**: Status change audit log
- **STATUS-V2-03**: Metrics/alerting for unresolved mappings

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Evolution API changes | Adapter-layer fixes only |
| New messaging features | Bug fixes only |
| UI changes | Backend fixes only |
| Performance optimization | Correctness first |
| Comprehensive test suite | Targeted tests only for new code |
| outgoingAPIMessageSent webhook | Optional confirmation, not critical for status |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LID-01 | Phase 1 | Pending |
| LID-02 | Phase 1 | Pending |
| LID-03 | Phase 1 | Pending |
| LID-04 | Phase 1 | Pending |
| STATUS-01 | Phase 2 | Pending |
| STATUS-02 | Phase 2 | Pending |
| STATUS-03 | Phase 2 | Pending |
| STATUS-04 | Phase 2 | Pending |
| STATUS-05 | Phase 2 | Pending |
| STATUS-06 | Phase 2 | Pending |
| STATUS-07 | Phase 3 | Pending |
| STATUS-08 | Phase 3 | Pending |
| STATUS-09 | Phase 3 | Pending |
| STATUS-10 | Phase 3 | Pending |
| STATUS-11 | Phase 3 | Pending |
| STATUS-12 | Phase 3 | Pending |
| STATUS-13 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2025-01-17*
*Last updated: 2025-01-17 after initial definition*
