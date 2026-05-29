# Track A Table Blueprint

This document defines the first-cut table blueprint for Track A implementation.

It is not the final migration code.
It is the canonical schema planning slice that agents should build first.

## Track A Goal

Support:

- crew-only users and roles
- structured business-data queries
- governed write-back workflows
- QBO/QBT source linkage
- CalExp5 action integration
- crew scheduling context
- crew communications/reminders
- projections needed for crew operations

## Guiding Rule

This blueprint should include only the tables needed to make Track A real.

Future-compatible extension points are acceptable.
Future product-surface activation is not.

## Table Groups

### 1. Identity And Core Graph

- `users`
- `parties`
- `contact_points`
- `party_contact_points`
- `entities`
- `entity_types`
- `user_entity_memberships`
- `entity_relationships`
- `events`
- `event_entities`

Minimum intent:

- identify crew/admin/lead users
- map users to operational entities
- support graph attachment for jobsites, crews, and operational records

### 2. Track A Profiles

- `employees_profile`
- `crews_profile`
- `jobsites_profile`
- `addresses`

Optional now:

- `places`

if jobsites/properties need a clean place anchor in phase 1

### 3. MDM And Source Linkage

- `external_systems`
- `external_records`
- `external_change_log`
- `external_sync_cursors`
- `entity_external_links`
- `attribute_history`

Track A source focus:

- QBO
- QBT
- current CalExp5 data where needed

### 4. Workflow And Approval

- `workflow_requests`
- `workflow_approvals`
- `workflow_executions`
- `idempotency_keys`
- `outbox_messages`
- `workflow_failures`
- `compensation_actions`
- `workflow_audit_events`

This is mandatory for A3.

### 5. Communications And Actioning

- `communications`
- `communication_threads`
- `communication_participants`
- `communication_entity_links`
- `communication_extractions`
- `signals`
- `action_candidates`
- `action_items`
- `reminders`
- `notifications`
- `notification_deliveries`

Track A focus:

- internal/crew use
- selected operational external reminders

### 6. Scheduling And Crew Operations

- `work_requests`
- `schedule_windows`
- `assignments`
- `service_engagements`

Track A focus:

- crew schedules
- jobsite assignments
- write-back-safe scheduling operations

### 7. Telemetry

- `gps_traces`
- `device_health_traces`
- `derived_signals`

Track A focus:

- crew GPS
- trace confidence
- device health diagnostics

### 8. Projections

- `projection_refresh_state`
- `crew_360_projection`
- `workflow_queue_projection`
- `approval_queue_projection`
- `knowledge_freshness_projection`
- `trace_quality_projection`

These may begin as materialized views, projection tables, or hybrid read models depending on implementation choice.

## Tables Explicitly Deferred From Phase 1 Activation

Do not prioritize these for first Track A implementation:

- `customer_360_projection`
- `property_360_projection`
- portal subscription tables for external stakeholders
- marketplace dispatch candidate tables
- geofence-heavy security monitoring tables
- full financial obligation expansion beyond Track A needs

## Key Schema Rules

1. Every table must have a clear owner domain.
2. Track A tables must be crew-platform-justified.
3. Important mutable operational tables must have timestamps and actor fields.
4. Workflow tables must support idempotency and retries.
5. Source-link tables must preserve upstream provenance.
6. Projection freshness must be explicit.

## Minimum Cross-Cutting Columns

Use consistently where appropriate:

- `id`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `status`

Use source/provenance columns where appropriate:

- `source_system`
- `source_record_id`
- `source_watermark`

Use temporal columns where appropriate:

- `valid_from`
- `valid_to`

## Recommended Build Order

1. identity and graph
2. source linkage
3. workflow and approval
4. communications/actioning
5. scheduling subset
6. telemetry subset
7. projections

## Next Design Step

The next practical step is to translate this blueprint into:

- actual Drizzle schema modules
- migration ordering
- seed data / enum definitions
