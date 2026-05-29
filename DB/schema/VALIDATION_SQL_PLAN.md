# Validation SQL Plan

This document translates the validation strategy into implementation-oriented SQL planning categories.

It is not the final SQL text.
It defines the query packs agents should write.

## Goal

Agents should produce concrete SQL or query scripts for each of these categories.

## Query Pack 1. Identity Reconciliation

Queries should answer:

- how many users exist in source vs target
- how many employee/crew entities exist in target
- how many source identities remain unmatched
- how many probable duplicates exist
- how many users lack memberships

## Query Pack 2. Source Freshness

Queries should answer:

- latest watermark by source system
- stale source records count
- records missing source watermarks
- records missing fetch timestamps

## Query Pack 3. Linkage Completeness

Queries should answer:

- external records without `entity_external_links`
- entities with expected source links missing
- attribute-history rows with broken parent linkage

## Query Pack 4. Workflow Integrity

Queries should answer:

- workflow requests by status
- approvals missing for approval-required requests
- duplicate idempotency keys
- executions without requests
- outbox backlog
- compensation backlog

## Query Pack 5. Communications Integrity

Queries should answer:

- communications missing participants
- threads with zero communications
- extractions without source communication
- reminders without source linkage
- notifications without delivery rows where required

## Query Pack 6. Scheduling Integrity

Queries should answer:

- assignments missing schedule windows
- engagements missing assignment linkage
- forbidden overlaps
- active crew without current scheduling context

## Query Pack 7. Telemetry Integrity

Queries should answer:

- GPS traces missing source entity
- device-health traces missing device or owner linkage
- derived signals missing provenance
- stale telemetry ingest by expected window

## Query Pack 8. Projection Freshness

Queries should answer:

- stale projections by SLA
- projection rows missing refresh metadata
- projection counts vs source counts
- broken queue projections

## Query Pack 9. Access Safety

Queries should answer:

- role memberships by role
- restricted-financial records exposed in non-admin slices if projectionized
- deferred customer/homeowner-facing tables or features accidentally activated

## Query Pack 10. Sample Record Fidelity

Queries should support human spot checks of:

- known employee
- known crew lead
- known jobsite
- known workflow request
- known QBO-linked record
- known QBT-linked record

## Execution Phases

These query packs should be runnable during:

- migration dry run
- shadow mode
- pre-cutover
- post-cutover

## Deliverable Rule

Agents should not stop at this plan.
They should turn each query pack into:

- concrete SQL files
- or deterministic query scripts
- plus expected interpretation notes
