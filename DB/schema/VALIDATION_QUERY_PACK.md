# Validation Query Pack

This document defines the categories of validation queries and checks that should be run during migration, shadow mode, and cutover readiness.

It is not final SQL.
It is the canonical validation checklist agents should translate into actual queries.

## Purpose

The new DB must be validated against:

- source systems
- old production behavior
- Track A operational expectations

## Validation Categories

### 1. Identity Reconciliation

Validate:

- total users migrated
- total employee/crew entities created
- unmatched source identities
- duplicate likely identities
- user-to-entity membership completeness

### 2. Source Linkage

Validate:

- external records landed
- external links created
- missing source watermarks
- stale source records
- records without linked entities

### 3. Workflow And Approval

Validate:

- workflow requests by status
- approval-required requests without approval records
- duplicate idempotency keys
- outbox backlog
- failed execution counts
- compensation backlog

### 4. Communications

Validate:

- communication counts by channel
- unresolved participant identities
- threads without participants
- reminders without source linkage
- notifications without delivery records where required

### 5. Scheduling

Validate:

- assignments without windows
- engagements without assignments
- overlapping assignment conflicts where forbidden
- crew schedule coverage for active users

### 6. Telemetry

Validate:

- GPS trace ingestion counts
- device-health trace freshness
- traces without source entity
- derived signals without provenance

### 7. Projections

Validate:

- projection refresh recency
- stale projections
- queue counts vs canonical source counts
- crew 360 sample accuracy

### 8. Access

Validate:

- admin, lead, crew role slices
- restricted data not visible in crew slice
- no deferred customer/homeowner surface accidentally active

## Sample Validation Questions

- How many QBO source records are unlinked?
- How many QBT worker records resolve to no Track A entity?
- How many workflow requests are stuck pending?
- How many approval-required actions have no approval record?
- How many projections are stale past the agreed SLA?
- How many duplicate memberships exist?
- Are any crew users seeing restricted financial records?

## Required Validation Phases

### Migration Dry Run

Focus:

- count reconciliation
- linkage completeness
- duplicate detection

### Shadow Mode

Focus:

- result parity
- projection correctness
- workflow safety
- agent answer quality

### Pre-Cutover

Focus:

- lag/freshness
- access safety
- queue health

### Post-Cutover

Focus:

- operational stability
- workflow failure rate
- projection freshness
- source sync continuity

## Design Rule

Validation is not optional.

Agents should not consider the new DB ready only because migrations ran successfully.
The system is ready only when the migration, linkage, workflow, projection, and access validations all pass.
