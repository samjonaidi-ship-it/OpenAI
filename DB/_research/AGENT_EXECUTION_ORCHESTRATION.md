# Agent Execution Orchestration

This document defines how implementation agents should be organized, sequenced, and constrained when building the new Track A database system.

It is the canonical execution-orchestration companion to:

- `README_DB_ARCHITECTURE.md`
- `AGENT_BUILD_READINESS.md`
- `TRACK_A_DB_ALIGNMENT.md`
- `DRIZZLE_MODULE_BREAKDOWN.md`
- `FIRST_MIGRATION_SEQUENCE.md`

## Purpose

The DB package is broad enough that uncontrolled parallel implementation would create:

- overlapping edits
- inconsistent schema semantics
- duplicate migrations
- rework across modules

This document defines:

- execution precedence for overlapping docs
- pods
- waves
- ownership boundaries

## Canonical Ownership Matrix

When docs overlap, use this ownership rule:

### Scope and activation

Canonical owner:

- `TRACK_A_DB_ALIGNMENT.md`

Meaning:

- what is active now
- what is deferred
- what Track A agents must not activate

### Vocabulary

Canonical owner:

- `CANONICAL_GLOSSARY.md`

Meaning:

- agents must use glossary terms in schema names, comments, and implementation notes

### Schema structure

Canonical owners:

- `TRACK_A_TABLE_BLUEPRINT.md`
- `DRIZZLE_MODULE_BREAKDOWN.md`
- `FIRST_MIGRATION_SEQUENCE.md`

### Workflow/governed writes

Canonical owner:

- `WORKFLOW_AND_APPROVAL_MODEL.md`

### Raw communications

Canonical owner:

- `COMMUNICATIONS_AND_ACTION_MODEL.md`

### Actions, reminders, notifications

Canonical owner:

- `ACTION_AND_NOTIFICATION_MODEL.md`

Meaning:

- if older docs mention alerts/reminders/notifications, this doc is the normalization source

### Projections and freshness

Canonical owner:

- `PROJECTION_AND_REFRESH_MODEL.md`

### Migration and cutover

Canonical owners:

- `MIGRATION_AND_CUTOVER_PLAN.md`
- `SOURCE_MIGRATION_SPEC.md`
- `CUTOVER_CHECKLIST.md`
- `ROLLBACK_CHECKLIST.md`
- `VALIDATION_QUERY_PACK.md`
- `VALIDATION_SQL_PLAN.md`

### Product vs harness DB separation

Canonical owner:

- `DATA_DOMAIN_BOUNDARIES.md`

## Pod Model

Agents should work in pods with disjoint ownership.

### Pod 1. Schema Foundation

Owns:

- core identity
- core graph
- Track A profiles

Primary docs:

- `TRACK_A_TABLE_BLUEPRINT.md`
- `DRIZZLE_MODULE_BREAKDOWN.md`
- `IDENTITY_AND_PARTY_MODEL.md`
- `DB_ARCHITECTURE.md`

### Pod 2. MDM And Migration

Owns:

- external linkage
- source ingestion scaffolding
- field mappings
- validation and reconciliation

Primary docs:

- `MASTER_DATA_MANAGEMENT.md`
- `SOURCE_MIGRATION_SPEC.md`
- `SOURCE_FIELD_MAPPING_SHEETS.md`
- `VALIDATION_QUERY_PACK.md`
- `VALIDATION_SQL_PLAN.md`

### Pod 3. Workflow And Actions

Owns:

- workflow governance
- approvals
- outbox
- communications
- action/reminder/notification pipeline

Primary docs:

- `WORKFLOW_AND_APPROVAL_MODEL.md`
- `COMMUNICATIONS_AND_ACTION_MODEL.md`
- `ACTION_AND_NOTIFICATION_MODEL.md`

### Pod 4. Scheduling And Telemetry

Owns:

- scheduling subset
- crew telemetry
- derived operational signals
- geospatial minimum needed for Track A

Primary docs:

- `SCHEDULING_AND_DISPATCH_MODEL.md`
- `OBSERVATIONS_AND_TELEMETRY_MODEL.md`
- `GEOSPATIAL_AND_PLACE_MODEL.md`

### Pod 5. Projections And Verification

Owns:

- projection scaffolding
- freshness model
- queue views
- crew 360
- implementation validation pack

Primary docs:

- `PROJECTION_AND_REFRESH_MODEL.md`
- `TRACK_A_TABLE_BLUEPRINT.md`
- `VALIDATION_QUERY_PACK.md`
- `VALIDATION_SQL_PLAN.md`

## Wave Model

Pods should not all build everything at once.

Use these waves:

### Wave 0. Freeze

Human confirmation required:

- Track A scope
- new DB parallel-build decision
- glossary
- first-cut table blueprint
- harness/product boundary

### Wave 1. Foundation

Build:

- Pod 1 core tables
- Pod 2 source-link base tables

No projections, no high-risk workflow execution yet.

### Wave 2. Governance

Build:

- Pod 3 workflow/approval/outbox
- Pod 1 remaining profile dependencies

### Wave 3. Operational Context

Build:

- Pod 4 scheduling subset
- Pod 4 telemetry subset
- Pod 3 communications core

### Wave 4. Read Models

Build:

- Pod 5 projection refresh scaffolding
- first Track A projections

### Wave 5. Migration And Shadow

Build and run:

- source ingestion jobs
- mapping sheets
- reconciliation queries
- shadow validation

### Wave 6. Cutover Readiness

Run:

- cutover checklist
- rollback rehearsal
- final validation packs

## Ownership Rules

1. Only one pod owns a migration file at a time.
2. Only one pod owns a table family at a time.
3. Projection pod must not redefine canonical write semantics.
4. Migration pod must not invent glossary terms.
5. Workflow pod must not bypass Track A scope rules.

## Branching Guidance

Recommended:

- shared integration branch: `track-a-db-rebuild`
- pod branches off integration branch
- migration changes merged in wave order

## Done Criteria For Agent Start

Implementation agents may start once:

- this DB folder is accepted as the architecture source
- pod ownership is assigned
- wave order is accepted
- first migration sequence is approved

## Bottom Line

The database package is broad enough for parallel work, but only if agents are organized into pods with disjoint ownership and merged in waves.
