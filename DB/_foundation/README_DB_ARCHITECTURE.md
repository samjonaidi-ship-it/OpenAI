# DB Architecture Readme

This folder (`OpenAI\DB`) is the **single consolidated home** for all architectural, schema, and reference material across the BB platform (CalExp5, BB Buddy, Micro Bridge, BB Scan, GPS, Data Manager, Control Tower).

Its purpose is to give humans and agents one coherent entrypoint before schema design and implementation begin.

## Primary Rule

Track A is the first implementation envelope.

That means the architecture must be:
- future-compatible
- Track-A-bounded in implementation

Do not activate future customer/homeowner/product-intelligence workflows just because the architecture can support them.

## Folder Map

| Folder | Purpose | Count |
|---|---|---|
| `_foundation/` | Entry points, glossary, alignment, platform roadmap | 4 |
| `architecture/` | Domain models (identity, entities, workflows, geo, financial, ecosystem, control plane) | 11 |
| `schema/` | DB schema, Drizzle modules, field specs, QBO/QBT mappings, validation | 15 |
| `operations/` | MDM, projections, search, scheduling, comms, telemetry, notification layer | 12 |
| `bridge/` | BB Micro Bridge audits, consumer catalogue, route classification, governance | 11 |
| `buddy/` | BB Buddy, Control Tower, Data Manager, Effective Dating, Writeback | 11 |
| `gps/` | GPS tracking strategy + QBT integration | 2 |
| `scan/` | BB Scan v2 spec, status, receipt capture hardening | 4 |
| `deployment/` | Cutover, rollback, migration sequence, Railway/Neon, env matrix, CI/CD | 19 |
| `_research/` | Audits, readiness reports, research, feasibility, screenshots | 13 |
| `_archive/` | Superseded versions kept for reference | 1 |

## Recommended Reading Order

### 1. Foundation (start here)
- [`_foundation/TRACK_A_DB_ALIGNMENT.md`](../_foundation/TRACK_A_DB_ALIGNMENT.md)
- [`_foundation/CANONICAL_GLOSSARY.md`](../_foundation/CANONICAL_GLOSSARY.md)
- [`_foundation/QBT_QBO_PLATFORM_ROADMAP.md`](../_foundation/QBT_QBO_PLATFORM_ROADMAP.md)

### 2. Architecture (domain models)
- `architecture/DATA_DOMAIN_BOUNDARIES.md`
- `architecture/IDENTITY_AND_PARTY_MODEL.md`
- `architecture/ENTITY_LIFECYCLE_MODEL.md`
- `architecture/ACCESS_AND_ENTITLEMENT_MODEL.md`
- `architecture/DOMAIN_AND_PORTAL_CONTEXT_MODEL.md`
- `architecture/WORKFLOW_AND_APPROVAL_MODEL.md`
- `architecture/GEOSPATIAL_AND_PLACE_MODEL.md`
- `architecture/FINANCIAL_AND_OBLIGATION_MODEL.md`
- `architecture/UNIVERSAL_CONTROL_PLANE_MODEL.md`
- `architecture/ECOSYSTEM_TARGET_ARCHITECTURE.md`
- `architecture/BB_ARCHITECTURE_ANALYSIS.md`

### 3. Schema (tables, fields, validation)
- `schema/DB_ARCHITECTURE.md`
- `schema/BB_DB_STRATEGY.md`
- `schema/BB_PLATFORM_SCHEMA-v2.md` (v1 in `_archive/`)
- `schema/BB_CALEXP5_SCHEMA.md`
- `schema/TRACK_A_TABLE_BLUEPRINT.md`
- `schema/DRIZZLE_MODULE_BREAKDOWN.md`
- `schema/BB_DRIZZLE_SCHEMA_CHECK.ts`
- `schema/SOURCE_FIELD_MAPPING_SHEETS.md`
- `schema/BB_QBO_QBT_FIELD_SUPERSET.md`
- `schema/BB_FIELD_ESTIMATE_SPEC.md`
- `schema/BB_FIELD_STATS.md`
- `schema/APP_PROJECTION_FAMILY_QBO_FINANCIALS_v1.md`
- `schema/VALIDATION_QUERY_PACK.md`
- `schema/VALIDATION_SQL_PLAN.md`
- `schema/BB_SCHEMA_VERIFICATION_LOG.md`

### 4. Operations (runtime behavior)
- `operations/MASTER_DATA_MANAGEMENT.md`
- `operations/BB_MDM_BEST_PRACTICES.md`
- `operations/PROJECTION_AND_REFRESH_MODEL.md`
- `operations/PROJECTION_REGISTRY_TEMPLATE.md`
- `operations/UNIVERSAL_PROJECTION_ARCHITECTURE.md`
- `operations/SEARCH_AND_DISCOVERY_STRATEGY.md`
- `operations/SCHEDULING_AND_DISPATCH_MODEL.md`
- `operations/COMMUNICATIONS_AND_ACTION_MODEL.md`
- `operations/ACTION_AND_NOTIFICATION_MODEL.md`
- `operations/OBSERVATIONS_AND_TELEMETRY_MODEL.md`
- `operations/UNIVERSAL_NOTIFICATION_LAYER.md` — **Canonical. Universal multi-tier notification layer: 5 channels (toast, in-app center, push, email, SMS), all audience segments, full type catalog, templates, delivery tracking, 6-phase implementation roadmap.**
- `operations/NOTIFICATION_ARCHITECTURE_PRINCIPLES.md` — **Canonical. Modern principles: event-driven dispatcher, 3-surface model (toast / in-app center / out-of-app), rate limiting, GPS unified plan implications. Collapses 6 overlapping mechanisms → 3 clean surfaces.**
- `operations/NOTIFICATION_OSS_AND_CRM.md` — **Canonical. Open-source tool evaluation: Novu (skip), Twenty CRM (deploy), Chatwoot (deploy for customer SMS). Revised build order integrating OSS tools. ~$65/mo additional for full CRM + customer communications.**

### 5. Feature areas
- `bridge/` — Micro Bridge audits, consumer spec, route classification, governance
- `buddy/` — BB Buddy v2 architecture, Control Tower, Data Manager, Effective Dating, Writeback, Unified App Gameplan
- `gps/` — Tracking strategy, QBT integration
- `scan/` — Scan v2 spec, status, receipt capture hardening

### 6. Deployment (execution)
- `deployment/IMPLEMENTATION_ACTION_CHECKLIST.md`
- `deployment/UNIVERSAL_CONTROL_PLANE_IMPLEMENTATION_PLAN.md`
- `deployment/BB_IMPLEMENTATION_SPECS.md`
- `deployment/FIRST_MIGRATION_SEQUENCE.md`
- `deployment/MIGRATION_AND_CUTOVER_PLAN.md`
- `deployment/SOURCE_MIGRATION_SPEC.md`
- `deployment/CUTOVER_CHECKLIST.md`
- `deployment/ROLLBACK_CHECKLIST.md`
- `deployment/SMOKE_TEST_RUNBOOK.md`
- `deployment/PRODUCTION_RAILWAY_NEON_FINDINGS.md`
- `deployment/PRODUCTION_SAFE_PLAN_AND_ENV_MODEL.md`
- `deployment/PRODUCTION_FIX_CHECKLIST.md`
- `deployment/PRODUCTION_HARDENING_REPORT.md`
- `deployment/GITHUB_RAILWAY_DEPLOY_WORKFLOW.md`
- `deployment/PROD_VS_STAGING_SERVICE_MAP.md`
- `deployment/STAGING_ENV_VARIABLE_MATRIX.md`
- `deployment/BRIDGE_DEPLOY_CONTEXT_CLEANUP_PLAN.md`
- `deployment/BRIDGE_PROD_2_REPLICA_CUTOVER.md`
- `deployment/BRIDGE_WORKER_SEPARATION_PLAN.md`

### 7. Research & audits (background)
- `_research/ARCHITECTURE_REVIEW_FINDINGS.md`
- `_research/BB_PLATFORM_READINESS_REPORT.md`
- `_research/BB_CROSS_DOC_AUDIT.md`
- `_research/AGENT_BUILD_READINESS.md`
- `_research/AGENT_EXECUTION_ORCHESTRATION.md`
- `_research/SIZING_FEASIBILITY_STUDY.md`
- `_research/RESEARCH_BEST_PRACTICES.md`
- `_research/RESEARCH_Human_Assets_Architecture.md`
- `_research/DISPATCH_MESSAGING_RESEARCH.md`

## Provenance

This consolidated index was built on **2026-04-14** by merging four previous doc locations:
- Original `OpenAI\DB\` (58 flat files)
- `OpenAI\` root (26 BB-prefixed docs moved from Claude\)
- `BB_Micro_Bridge\docs\planning\openai-archive\` (14 files — 2 identical duplicates deleted)
- `BB_Micro_Bridge\docs\` (11 broader-than-bridge docs)

The `BB_Micro_Bridge` repo now holds only its own operational docs. `BB_PLATFORM_SCHEMA-v1_superseded.md` is archived in `_archive/` with `schema/BB_PLATFORM_SCHEMA-v2.md` as canonical.

*Updated: 2026-05-09*
