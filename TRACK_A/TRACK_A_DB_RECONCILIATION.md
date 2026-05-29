# Track A DB Reconciliation

This document reconciles the Track A crew-platform source docs with the new DB architecture package in `C:\Users\samjo\Desktop\OpenAI\DB`.

It does not replace the Track A source doc.
It explains how Track A should consume the broader DB architecture safely.

## Canonical Track A Source

Track A source scope remains governed by:

- `BB_BUDDY_CREW_PLATFORM_v1.7.md`

That file is canonical for:

- A0–A3 scope
- crew-only boundary
- forbidden features
- dependency gates

## Why Reconciliation Is Needed

The DB architecture package is broader than Track A because it preserves future-compatible platform structure.

Track A must use only the subset needed for:

- crew identities
- crew knowledge
- crew operations assistant
- QBO/QBT query support
- CalExp5 action routing
- governed write-back

## Reconciled Interpretation

### 1. Track A Uses The New DB As A Crew-Platform Backbone

Active now:

- identity and party subset
- entity graph subset
- source linkage for QBO/QBT/current CalExp5
- workflow/approval system
- crew communications/actioning
- crew scheduling subset
- crew telemetry subset
- Track A projections

### 2. Future Platform Domains Remain Deferred

Deferred in Track A:

- customer portals
- supplier portals as product surfaces
- homeowner notifications
- customer uploads
- property intelligence product workflows
- full marketplace dispatch activation

### 3. Track A Must Respect The RAG vs SQL Split

Keep:

- `knowledge` = unstructured crew docs
- `query_data` = structured business data

Do not blur this through DB shortcuts.

### 4. Track A Depends On Workflow Governance

Track A A3 requires:

- approvals
- idempotency
- outbox
- retry
- compensation

So Track A implementation must use the workflow model, not ad hoc endpoint writes.

## Required DB Docs For Track A Agents

Track A agents should read at minimum:

1. `..\DB\README_DB_ARCHITECTURE.md`
2. `..\DB\TRACK_A_DB_ALIGNMENT.md`
3. `..\DB\CANONICAL_GLOSSARY.md`
4. `..\DB\TRACK_A_TABLE_BLUEPRINT.md`
5. `..\DB\DRIZZLE_MODULE_BREAKDOWN.md`
6. `..\DB\FIRST_MIGRATION_SEQUENCE.md`
7. `..\DB\MIGRATION_AND_CUTOVER_PLAN.md`
8. `..\DB\AGENT_BUILD_READINESS.md`
9. `..\DB\AGENT_EXECUTION_ORCHESTRATION.md`

## Design Rule

Track A is the first implementation slice of the new DB architecture, not the full activation of the long-term platform.
