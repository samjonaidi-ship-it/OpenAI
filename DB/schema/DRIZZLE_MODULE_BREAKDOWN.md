# Drizzle Module Breakdown

This document defines the recommended Drizzle schema/module structure for implementing the new Track A database.

It is a planning artifact for code organization.

## Goal

Keep the schema implementation:

- modular
- Track-A-first
- future-compatible
- easy to migrate and review

## Recommended Module Groups

### 1. Core Identity

Files:

- `schema/core/users.ts`
- `schema/core/parties.ts`
- `schema/core/contact-points.ts`
- `schema/core/entity-types.ts`
- `schema/core/entities.ts`
- `schema/core/memberships.ts`

Purpose:

- principals
- parties
- contact points
- entities
- memberships

### 2. Core Graph

Files:

- `schema/graph/entity-relationships.ts`
- `schema/graph/events.ts`
- `schema/graph/event-entities.ts`

Purpose:

- graph edges
- event ledger
- event participants

### 3. Profiles

Files:

- `schema/profiles/employees.ts`
- `schema/profiles/crews.ts`
- `schema/profiles/jobsites.ts`
- `schema/profiles/addresses.ts`

Purpose:

- Track A typed operational profiles

### 4. Source Linkage / MDM

Files:

- `schema/mdm/external-systems.ts`
- `schema/mdm/external-records.ts`
- `schema/mdm/external-change-log.ts`
- `schema/mdm/external-sync-cursors.ts`
- `schema/mdm/entity-external-links.ts`
- `schema/mdm/attribute-history.ts`

Purpose:

- QBO/QBT and legacy linkage
- source provenance
- change tracking

### 5. Workflow And Approval

Files:

- `schema/workflow/requests.ts`
- `schema/workflow/approvals.ts`
- `schema/workflow/executions.ts`
- `schema/workflow/idempotency-keys.ts`
- `schema/workflow/outbox-messages.ts`
- `schema/workflow/failures.ts`
- `schema/workflow/compensation-actions.ts`
- `schema/workflow/audit.ts`

Purpose:

- governed write-back
- approval pipeline
- idempotency
- outbox

### 6. Communications And Actions

Files:

- `schema/comms/communications.ts`
- `schema/comms/threads.ts`
- `schema/comms/participants.ts`
- `schema/comms/entity-links.ts`
- `schema/comms/extractions.ts`
- `schema/actions/signals.ts`
- `schema/actions/action-candidates.ts`
- `schema/actions/action-items.ts`
- `schema/actions/reminders.ts`
- `schema/actions/notifications.ts`
- `schema/actions/notification-deliveries.ts`

Purpose:

- communication history
- derived action/reminder/notification pipeline

### 7. Scheduling

Files:

- `schema/scheduling/work-requests.ts`
- `schema/scheduling/schedule-windows.ts`
- `schema/scheduling/assignments.ts`
- `schema/scheduling/service-engagements.ts`

Purpose:

- Track A crew scheduling subset

### 8. Telemetry

Files:

- `schema/telemetry/gps-traces.ts`
- `schema/telemetry/device-health-traces.ts`
- `schema/telemetry/derived-signals.ts`

Purpose:

- crew GPS
- device health
- derived operational signals

### 9. Projections

Files:

- `schema/projections/projection-refresh-state.ts`
- projection tables or materialized view definitions in a separate module tree

Purpose:

- freshness tracking
- read models

## Migration Folder Strategy

Recommended:

- one migration stream for the product DB
- harness DB migrations separate

Within product DB:

- keep migration filenames chronological
- group initial migrations by dependency order, not by every file individually

## Recommended Implementation Order

1. core identity
2. core graph
3. profiles
4. MDM/source linkage
5. workflow
6. communications/actions
7. scheduling
8. telemetry
9. projections

## Design Rules

1. Keep modules aligned to architectural domains.
2. Keep Track A-first tables in the initial stream.
3. Keep deferred/future-heavy tables out of phase 1 unless explicitly approved.
4. Separate harness schema code from product schema code.
5. Prefer narrow, reviewable migration batches.
